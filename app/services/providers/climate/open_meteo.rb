module Providers
  module Climate
    # Weather forecast from Open-Meteo's COMMERCIAL API ("API Standard",
    # https://open-meteo.com/en/pricing), or from a self-hosted Open-Meteo
    # instance. The free endpoints (api.open-meteo.com and siblings) are not
    # allowed for commercial use: they are refused here, even if configured
    # by mistake.
    #
    #   OPEN_METEO_API_KEY  key of the commercial subscription (customer-api)
    #   OPEN_METEO_URL      optional base URL, for a self-hosted instance
    #                       (no key needed); default https://customer-api.open-meteo.com
    #
    # Only the forecast is used: history and climate projections are not
    # part of the plan Semisto subscribes to. Data licence: CC BY 4.0,
    # attribution "Open-Meteo.com" shown next to the data.
    class OpenMeteo < Provider
      COMMERCIAL_URL = "https://customer-api.open-meteo.com".freeze
      FORECAST_DAYS = 7
      CACHE_TTL = 1.hour
      DAILY = %w[
        weather_code temperature_2m_max temperature_2m_min precipitation_sum
        precipitation_probability_max wind_gusts_10m_max
      ].freeze

      def self.from_env(env = ENV)
        new(api_key: env["OPEN_METEO_API_KEY"], base_url: env["OPEN_METEO_URL"])
      end

      def initialize(api_key:, base_url: nil, timezone: "Europe/Brussels")
        @api_key = api_key.presence
        @base_url = (base_url.presence || COMMERCIAL_URL).chomp("/")
        @timezone = timezone
      end

      def configured?
        return false if free_endpoint?
        commercial? ? @api_key.present? : true
      end

      def supports?(capability) = capability == :forecast && configured?

      def forecast(point)
        return unavailable(:not_configured) unless configured?
        point = Point.from(point)
        return unavailable(:no_location) unless point

        cached("forecast", point.cache_key(2), expires_in: CACHE_TTL) { fetch_forecast(point) }
      end

      private
        def host = URI.parse(@base_url).host.to_s.downcase
        def commercial? = host == URI.parse(COMMERCIAL_URL).host

        # Any *.open-meteo.com host except the customer API is a free endpoint.
        def free_endpoint?
          (host == "open-meteo.com" || host.end_with?(".open-meteo.com")) && !commercial?
        rescue URI::InvalidURIError
          true
        end

        def fetch_forecast(point)
          response = connection.get("v1/forecast", forecast_params(point))
          return upstream_error("HTTP #{response.status}") unless response.success? && response.body.is_a?(Hash)

          ok(parse(response.body))
        rescue Faraday::Error, JSON::ParserError, KeyError, TypeError => error
          upstream_error(error.class.name)
        end

        def forecast_params(point)
          params = {
            latitude: point.lat.round(3),
            longitude: point.lng.round(3),
            daily: DAILY.join(","),
            timezone: @timezone,
            forecast_days: FORECAST_DAYS
          }
          params[:apikey] = @api_key if @api_key
          params
        end

        def parse(body)
          daily = body.fetch("daily")
          days = daily.fetch("time").each_with_index.map do |date, index|
            {
              date:,
              weather_code: daily["weather_code"]&.at(index),
              tmax_c: daily["temperature_2m_max"]&.at(index),
              tmin_c: daily["temperature_2m_min"]&.at(index),
              precip_mm: daily["precipitation_sum"]&.at(index),
              precip_probability_pct: daily["precipitation_probability_max"]&.at(index),
              wind_gusts_kmh: daily["wind_gusts_10m_max"]&.at(index)
            }
          end
          {
            days:,
            elevation_m: body["elevation"],
            timezone: body["timezone"],
            fetched_at: Time.current.iso8601,
            attribution: { name: "Open-Meteo.com", url: "https://open-meteo.com", licence: "CC BY 4.0" }
          }
        end

        def upstream_error(detail)
          Rails.logger.warn("[climate] Open-Meteo forecast unavailable: #{detail}")
          unavailable(:upstream_error)
        end

        def connection
          @connection ||= Faraday.new(url: "#{@base_url}/", request: { open_timeout: 3, timeout: 8 }) do |f|
            f.response :json, content_type: /\bjson$/
            f.headers["User-Agent"] = "SemistoDesigner (+https://designer.semisto.org)"
          end
        end
    end
  end
end
