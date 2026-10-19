module Providers
  module Climate
    # Weather forecast from the Norwegian Meteorological Institute's
    # Locationforecast 2.0 (https://api.met.no/weatherapi/locationforecast/2.0/),
    # which covers Europe, is free and allows commercial use under its terms
    # of service: a User-Agent that names the app and a contact, at most 4
    # decimals in coordinates, and a cache. Data licence: CC BY 4.0
    # (attribution "MET Norway" shown next to the data).
    #
    #   METNO_URL  optional base URL (a mirror); default https://api.met.no
    #
    # The service answers hourly then six-hourly steps in UTC; they are
    # gathered into local days with the same keys as Open-Meteo's daily
    # forecast, weather as a WMO code.
    class MetNorway < Provider
      DEFAULT_URL = "https://api.met.no".freeze
      USER_AGENT = "SemistoTerranova/1.0 (+https://terranova.semisto.org; hello@semisto.org)".freeze
      FORECAST_DAYS = 7
      CACHE_TTL = 1.hour
      # met.no symbol (without its _day / _night / _polartwilight suffix) => WMO weather code.
      SYMBOLS = {
        "clearsky" => 0, "fair" => 1, "partlycloudy" => 2, "cloudy" => 3, "fog" => 45,
        "lightrain" => 61, "rain" => 63, "heavyrain" => 65,
        "lightsleet" => 66, "sleet" => 67, "heavysleet" => 67,
        "lightsnow" => 71, "snow" => 73, "heavysnow" => 75,
        "lightrainshowers" => 80, "rainshowers" => 81, "heavyrainshowers" => 82,
        "lightsleetshowers" => 85, "sleetshowers" => 85, "heavysleetshowers" => 86,
        "lightsnowshowers" => 85, "snowshowers" => 85, "heavysnowshowers" => 86
      }.freeze

      def self.from_env(env = ENV) = new(base_url: env["METNO_URL"])

      def initialize(base_url: nil, timezone: "Europe/Brussels")
        @base_url = (base_url.presence || DEFAULT_URL).chomp("/")
        @zone = ActiveSupport::TimeZone[timezone] || Time.zone
      end

      def supports?(capability) = capability == :forecast

      def forecast(point)
        point = Point.from(point)
        return unavailable(:no_location) unless point

        cached("forecast", point.cache_key(2), expires_in: CACHE_TTL) { fetch_forecast(point) }
      end

      private
        def fetch_forecast(point)
          response = connection.get("weatherapi/locationforecast/2.0/complete", lat: point.lat.round(4), lon: point.lng.round(4))
          return upstream_error("HTTP #{response.status}") unless response.success? && response.body.is_a?(Hash)

          ok(parse(response.body))
        rescue Faraday::Error, JSON::ParserError, KeyError, TypeError, ArgumentError, NoMethodError => error
          upstream_error(error.class.name)
        end

        def parse(body)
          steps = body.fetch("properties").fetch("timeseries")
          by_day = steps.group_by { |step| Time.iso8601(step.fetch("time")).in_time_zone(@zone).to_date }
          days = by_day.keys.sort.first(FORECAST_DAYS).map { |date| day(date, by_day[date]) }
          {
            days:,
            elevation_m: body.dig("geometry", "coordinates", 2),
            timezone: @zone.tzinfo.name,
            fetched_at: Time.current.iso8601,
            attribution: { name: "MET Norway", url: "https://api.met.no", licence: "CC BY 4.0" }
          }
        end

        def day(date, steps)
          temperatures = steps.flat_map do |step|
            data = step["data"] || {}
            [ data.dig("instant", "details", "air_temperature"),
              data.dig("next_6_hours", "details", "air_temperature_min"),
              data.dig("next_6_hours", "details", "air_temperature_max") ]
          end.compact
          {
            date: date.iso8601,
            weather_code: weather_code(steps),
            tmax_c: temperatures.max&.round(1),
            tmin_c: temperatures.min&.round(1),
            precip_mm: precipitation(steps),
            precip_probability_pct: steps.filter_map { _1.dig("data", "next_6_hours", "details", "probability_of_precipitation") }.max&.round,
            wind_gusts_kmh: steps.filter_map { _1.dig("data", "instant", "details", "wind_speed_of_gust") }.max&.then { (_1 * 3.6).round(1) }
          }
        end

        # Hourly amounts while the service gives them, six-hourly ones after,
        # never both for the same hours.
        def precipitation(steps)
          covered_until = nil
          total = steps.sum do |step|
            time = Time.iso8601(step["time"])
            next 0 if covered_until && time < covered_until
            if (hourly = step.dig("data", "next_1_hours", "details", "precipitation_amount"))
              covered_until = time + 1.hour
              hourly
            elsif (six = step.dig("data", "next_6_hours", "details", "precipitation_amount"))
              covered_until = time + 6.hours
              six
            else
              0
            end
          end
          total.round(1)
        end

        # The day's weather is the one forecast for the six hours around noon,
        # else the first one given.
        def weather_code(steps)
          noon = steps.min_by { (Time.iso8601(_1["time"]).in_time_zone(@zone).hour - 11).abs }
          symbol = [ noon, *steps ].lazy.filter_map { _1.dig("data", "next_6_hours", "summary", "symbol_code") || _1.dig("data", "next_1_hours", "summary", "symbol_code") }.first
          return nil unless symbol
          base = symbol.sub(/_(day|night|polartwilight)\z/, "")
          base.include?("thunder") ? 95 : SYMBOLS[base]
        end

        def upstream_error(detail)
          Rails.logger.warn("[climate] MET Norway forecast unavailable: #{detail}")
          unavailable(:upstream_error)
        end

        def connection
          @connection ||= Faraday.new(url: "#{@base_url}/", request: { open_timeout: 3, timeout: 8 }) do |f|
            f.response :json, content_type: /\bjson$/
            f.headers["User-Agent"] = USER_AGENT
          end
        end
    end
  end
end
