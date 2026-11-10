# The boundary of a commune, found by its name, behind a small stable
# interface:
#
#   communes = Providers::CommuneBoundaries.build
#   communes.available?                      # false when COMMUNE_BOUNDARIES_PROVIDER=none
#   communes.search("Yvoir", countries: %w[BE FR])  # => [Candidate, ...]
#   communes.fetch("R2268384")               # => Boundary (GeoJSON polygon)
#
# Configured by ENV:
# - COMMUNE_BOUNDARIES_PROVIDER: nominatim (default) | none
# - COMMUNE_BOUNDARIES_URL: base URL (else GEOCODER_URL, else the public
#   Nominatim)
# - GEOCODER_USER_AGENT_EMAIL: contact sent to Nominatim (usage policy)
#
# OpenStreetMap's administrative boundaries (ODbL) are the same everywhere
# in Europe; a region's official boundaries can replace them later behind
# this interface. Searches and boundaries are cached a week.
module Providers
  class CommuneBoundaries
    class Unavailable < StandardError; end
    class NotFound < StandardError; end

    Candidate = Data.define(:id, :name, :detail, :lng, :lat, :bbox) do
      def as_json(*) = { id:, name:, detail:, lng:, lat:, bbox: }
    end
    Boundary = Data.define(:id, :name, :detail, :geometry, :provider, :licence)

    DEFAULT_URL = "https://nominatim.openstreetmap.org".freeze
    MIN_LENGTH = 2
    MAX_LENGTH = 120
    CACHE_TTL = 1.week
    ID_FORMAT = /\A[RW]\d{1,12}\z/

    def self.build(env = ENV)
      name = env.fetch("COMMUNE_BOUNDARIES_PROVIDER", "nominatim").to_s.strip.downcase
      return new(nil) unless name == "nominatim"
      url = env["COMMUNE_BOUNDARIES_URL"].presence || env["GEOCODER_URL"].presence || DEFAULT_URL
      new(Nominatim.new(url:, contact: env["GEOCODER_USER_AGENT_EMAIL"].presence))
    end

    def initialize(adapter)
      @adapter = adapter
    end

    def available? = !@adapter.nil?

    def search(query, countries: [])
      raise Unavailable, "not configured" unless available?
      query = query.to_s.squish.first(MAX_LENGTH)
      return [] if query.length < MIN_LENGTH
      countries = Array(countries).map { |c| c.to_s.downcase }.select { |c| c.match?(/\A[a-z]{2}\z/) }.uniq.sort
      key = [ "territory/communes", Digest::SHA1.hexdigest("#{query.downcase}|#{countries.join(',')}") ].join("/")
      rows = Rails.cache.fetch(key, expires_in: CACHE_TTL) { @adapter.search(query, countries:).map(&:to_h) }
      rows.map { |row| Candidate.new(**row.symbolize_keys) }
    rescue GeoHttp::Error => e
      raise Unavailable, e.message
    end

    def fetch(id)
      raise Unavailable, "not configured" unless available?
      id = id.to_s.strip.upcase
      raise NotFound, id unless id.match?(ID_FORMAT)
      row = Rails.cache.fetch("territory/commune/#{id}", expires_in: CACHE_TTL) { @adapter.fetch(id)&.to_h }
      raise NotFound, id unless row
      Boundary.new(**row.symbolize_keys)
    rescue GeoHttp::Error => e
      raise Unavailable, e.message
    end

    # https://nominatim.org/release-docs/latest/api/Search/ and /Lookup/.
    class Nominatim
      # Shared with the address search: one request a second for the app.
      THROTTLE_KEY = Providers::Geocoder::Nominatim::THROTTLE_KEY
      # A commune is admin_level 8 in Belgium, France and Luxembourg, which
      # Nominatim ranks 12 to 16 (a town, a village); a section of a merged
      # commune comes out as a « city_district » and is left out.
      RANKS = 12..16
      KINDS = %w[municipality city town village hamlet].freeze
      # ~20 m: plenty for a commune seen whole, and a light polygon.
      SIMPLIFY_DEGREES = 0.0002
      LICENCE = "© OpenStreetMap contributors, ODbL 1.0".freeze

      def initialize(url:, contact: nil)
        @url = url.chomp("/")
        @contact = contact
      end

      def search(query, countries:)
        throttle!
        params = { q: query, format: "jsonv2", addressdetails: 0, limit: 10, "accept-language": "fr", featureType: "settlement" }
        params[:countrycodes] = countries.join(",") if countries.any?
        params[:email] = @contact if @contact
        rows = GeoHttp.get_json("#{@url}/search", params:, headers:, timeout: 8, breaker: false)
        Array(rows).filter_map { |row| candidate(row) if row.is_a?(Hash) && commune?(row) }
      end

      def fetch(id)
        throttle!
        params = { osm_ids: id, format: "jsonv2", polygon_geojson: 1, polygon_threshold: SIMPLIFY_DEGREES, "accept-language": "fr" }
        params[:email] = @contact if @contact
        row = Array(GeoHttp.get_json("#{@url}/lookup", params:, headers:, timeout: 15, breaker: false)).first
        return nil unless row.is_a?(Hash) && commune?(row)
        geometry = row["geojson"]
        return nil unless geometry.is_a?(Hash) && %w[Polygon MultiPolygon].include?(geometry["type"])
        Boundary.new(id:, name: row["name"].to_s, detail: detail(row), geometry:, provider: "nominatim", licence: LICENCE)
      end

      private
        def headers
          { "User-Agent" => [ GeoHttp::USER_AGENT, @contact && "contact: #{@contact}" ].compact.join(" ") }
        end

        def throttle!
          return if Rails.cache.write(THROTTLE_KEY, 1, unless_exist: true, expires_in: 1.second)
          sleep 1
          Rails.cache.write(THROTTLE_KEY, 1, expires_in: 1.second)
        end

        def commune?(row)
          category = row["category"] || row["class"]
          category == "boundary" && row["type"] == "administrative" && %w[relation way].include?(row["osm_type"]) &&
            RANKS.cover?(row["place_rank"].to_i) && KINDS.include?(row["addresstype"].to_s)
        end

        def candidate(row)
          south, north, west, east = Array(row["boundingbox"]).map { |v| Float(v) }
          id = "#{row['osm_type'] == 'relation' ? 'R' : 'W'}#{row['osm_id']}"
          Candidate.new(id:, name: row["name"].to_s, detail: detail(row), lng: Float(row["lon"]), lat: Float(row["lat"]),
                        bbox: west && [ west, south, east, north ])
        rescue ArgumentError, TypeError
          nil
        end

        # « Dinant, Namur, Wallonie, Belgique »: the display name without the
        # commune itself and the postcode.
        def detail(row)
          parts = row["display_name"].to_s.split(",").map(&:strip)
          parts.drop(1).reject { |part| part.match?(/\A\d{4,5}\z/) }.map { |part| part.split(" / ").first }.uniq.join(", ").presence
        end
    end
  end
end
