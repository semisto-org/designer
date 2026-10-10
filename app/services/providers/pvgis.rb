# Horizon and solar radiation from PVGIS (Photovoltaic Geographical
# Information System, European Commission Joint Research Centre), behind a
# small stable interface:
#
#   pvgis = Providers::Pvgis.build
#   pvgis.available?                 # false when PVGIS_PROVIDER=none
#   pvgis.horizon(point)             # => Providers::Pvgis::Horizon
#   pvgis.monthly_irradiation(point) # => Providers::Pvgis::Irradiation
#
# Both raise Providers::Pvgis::Unavailable (with a #reason: :not_configured,
# :out_of_coverage for the sea or a place outside the databases, or
# :upstream_error) instead of returning partial data.
#
# The horizon is computed by PVGIS from a digital elevation model (about
# 90 m): hills and valley sides, never trees or buildings. Radiation is the
# monthly irradiation on a horizontal plane, horizon shading included,
# averaged over every year of the database PVGIS picks for the place.
#
# Configured by ENV:
# - PVGIS_PROVIDER: pvgis (default) | none
# - PVGIS_URL: the API base (default https://re.jrc.ec.europa.eu/api/v5_3)
#
# The API is GET only, refuses browser calls (so it is always called from
# here) and allows 30 requests per second per IP. Neither the horizon nor
# the monthly averages change: answers are cached for a long time, per point
# rounded to 3 decimals (about 100 m), and failures are not cached.
#
# Data use: "free for public use if the source is acknowledged"
# (PVGIS © European Communities, 2001-<year>).
module Providers
  class Pvgis
    class Unavailable < StandardError
      attr_reader :reason

      def initialize(reason, detail = nil)
        @reason = reason
        super([ reason, detail ].compact.join(": "))
      end
    end

    # Azimuths are compass bearings (0 = north, 90 = east, 180 = south),
    # heights in degrees above the flat horizon.
    Horizon = Data.define(:profile, :elevation_m, :source) do
      def as_json(*) = { profile: profile.map { |azimuth, height| { azimuth:, height: } }, elevation_m:, source: }
    end

    # monthly: 12 values in kWh/m² (January first), averaged over the years.
    Irradiation = Data.define(:monthly, :year_min, :year_max, :database)

    DEFAULT_URL = "https://re.jrc.ec.europa.eu/api/v5_3".freeze
    HORIZON_TTL = 1.year
    IRRADIATION_TTL = 180.days
    PRECISION = 3
    OPEN_TIMEOUT = 5
    TIMEOUT = 15
    USER_AGENT = "SemistoDesigner/1.0 (+https://designer.semisto.org)".freeze

    def self.build(env = ENV)
      name = env.fetch("PVGIS_PROVIDER", "pvgis").to_s.strip.downcase
      return new(nil) unless name == "pvgis"

      new(env["PVGIS_URL"].presence || DEFAULT_URL)
    end

    def initialize(url, connection: nil)
      @url = url&.chomp("/")
      @connection = connection
    end

    def available? = !@url.nil?

    def attribution = "PVGIS © European Communities, 2001-#{Date.current.year}"

    def horizon(point)
      row = cached("horizon", point, HORIZON_TTL) do
        body = fetch("printhorizon", point)
        outputs = body.fetch("outputs")
        profile = outputs.fetch("horizon_profile").map { |p| [ compass(p.fetch("A")), p.fetch("H_hor").to_f ] }
        {
          "profile" => profile.uniq(&:first).sort_by(&:first),
          "elevation_m" => body.dig("inputs", "location", "elevation"),
          "source" => body.dig("inputs", "horizon_db")
        }
      end
      Horizon.new(profile: row["profile"], elevation_m: row["elevation_m"], source: row["source"])
    end

    def monthly_irradiation(point)
      row = cached("mrcalc", point, IRRADIATION_TTL) do
        body = fetch("MRcalc", point, horirrad: 1)
        by_month = body.dig("outputs", "monthly").to_a.group_by { _1.fetch("month").to_i }
        monthly = (1..12).map do |month|
          values = Array(by_month[month]).filter_map { _1["H(h)_m"]&.to_f }
          values.empty? ? nil : (values.sum / values.size).round(1)
        end
        raise Unavailable.new(:upstream_error, "no monthly values") if monthly.all?(&:nil?)

        meteo = body.dig("inputs", "meteo_data") || {}
        { "monthly" => monthly, "year_min" => meteo["year_min"], "year_max" => meteo["year_max"], "database" => meteo["radiation_db"] }
      end
      Irradiation.new(**row.symbolize_keys)
    end

    private
      # PVGIS counts azimuths from the south (0 = S, 90 = W, -90 = E).
      def compass(pvgis_azimuth) = ((pvgis_azimuth.to_f + 180) % 360).round(1)

      def cached(kind, point, ttl)
        raise Unavailable.new(:not_configured) unless available?

        lat, lng = point.lat.round(PRECISION), point.lng.round(PRECISION)
        key = [ "sun/pvgis/v1", kind, Digest::SHA1.hexdigest(@url)[0, 8], lat, lng ].join("/")
        Rails.cache.fetch(key, expires_in: ttl) { yield }
      rescue KeyError, NoMethodError, TypeError => error
        raise Unavailable.new(:upstream_error, error.class.name)
      end

      def fetch(tool, point, **params)
        query = { lat: point.lat.round(PRECISION), lon: point.lng.round(PRECISION), outputformat: "json", **params }
        response = connection.get(tool, query)
        body = parse(response.body)
        # PVGIS answers 400 with a message for the sea or a place outside its
        # databases ("Location over the sea", "...not covered...").
        raise Unavailable.new(:out_of_coverage, (body["message"] if body.is_a?(Hash))) if response.status == 400
        raise Unavailable.new(:upstream_error, "HTTP #{response.status}") unless response.success? && body.is_a?(Hash)

        body
      rescue Faraday::Error => error
        Rails.logger.warn("[sun] PVGIS #{tool} unavailable: #{error.class}")
        raise Unavailable.new(:upstream_error, error.class.name)
      end

      def parse(body)
        body.is_a?(String) ? JSON.parse(body) : body
      rescue JSON::ParserError
        nil
      end

      def connection
        @connection ||= Faraday.new(url: "#{@url}/", request: { open_timeout: OPEN_TIMEOUT, timeout: TIMEOUT }) do |f|
          f.headers["User-Agent"] = USER_AGENT
        end
      end
  end
end
