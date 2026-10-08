module Providers
  module WeatherStations
    # Stations and daily observations of the Belgian Royal Meteorological
    # Institute (IRM / KMI), from its open data WFS services
    # (https://opendata.meteo.be, licence CC BY 4.0, attribution "IRM").
    #
    #   IRM_OPENDATA_URL  base URL of the services, default https://opendata.meteo.be/service
    #
    # Two networks are read:
    # - AWS (aws/wfs): ~14 automatic climatological stations with quality
    #   controlled daily values (min/max temperature, rain, soil temperature,
    #   sunshine), layer aws:aws_1day. These are the ones whose days we show.
    # - SYNOP (synop/wfs): ~30 synoptic stations (airfields, mostly), placed on
    #   the map for orientation. Their hourly reports have gaps and their
    #   extremes and rain are reported over shifting periods, so no daily
    #   record is built from them.
    #
    # The station list is cached one day, observations one hour.
    class Irm
      DEFAULT_URL = "https://opendata.meteo.be/service".freeze
      STATIONS_TTL = 1.day
      DAILY_TTL = 1.hour
      DAILY_FIELDS = %w[code timestamp temp_min temp_max temp_avg precip_quantity temp_soil_avg_5cm temp_soil_avg_10cm sun_duration].freeze
      ATTRIBUTION = { name: "IRM", url: "https://opendata.meteo.be", licence: "CC BY 4.0" }.freeze

      def self.from_env(env = ENV)
        new(base_url: env["IRM_OPENDATA_URL"])
      end

      def initialize(base_url: nil)
        @base_url = (base_url.presence || DEFAULT_URL).chomp("/")
      end

      def key = "irm"
      def configured? = true
      def attribution = ATTRIBUTION

      def stations
        cached("stations", expires_in: STATIONS_TTL) { fetch_stations }
          .then { |result| result.available? ? ok(result.data.map { |row| Station.new(**row.symbolize_keys) }) : result }
      end

      # Daily observations of one AWS station from `since` (a Date) to the last
      # published day, oldest first.
      def daily(code, since:)
        code = Integer(code)
        since = since.to_date
        cached("daily", code, since.iso8601, expires_in: DAILY_TTL) { fetch_daily(code, since) }
          .then { |result| result.available? ? ok(result.data.map { |row| DailyObservation.new(**row.symbolize_keys) }) : result }
      end

      private
        def fetch_stations
          aws = features("aws/wfs", "aws:aws_station")
          synop = features("synop/wfs", "synop:synop_station")
          by_code = {}
          [ [ "aws", aws ], [ "synop", synop ] ].each do |network, list|
            list.each do |feature|
              row = station_row(feature, network) or next
              existing = by_code[row[:code]]
              if existing
                existing[:networks] |= row[:networks]
                existing[:daily] ||= row[:daily]
              else
                by_code[row[:code]] = row
              end
            end
          end
          ok(by_code.values.sort_by { |row| row[:name] })
        rescue Faraday::Error, JSON::ParserError, KeyError, TypeError, ArgumentError => error
          upstream_error("stations", error)
        end

        # A station still open, with a position. nil otherwise.
        def station_row(feature, network)
          props = feature.fetch("properties")
          ended = props["date_end"].presence && Time.zone.parse(props["date_end"].to_s)
          return nil if ended && ended < Time.current

          lng, lat = feature.dig("geometry", "coordinates")
          return nil unless lng.is_a?(Numeric) && lat.is_a?(Numeric)

          {
            code: Integer(props.fetch("code")), name: display_name(props["name"]),
            lng: lng.to_f.round(5), lat: lat.to_f.round(5),
            altitude_m: props["altitude"]&.to_f&.round(1),
            networks: [ network ], daily: network == "aws"
          }
        end

        def fetch_daily(code, since)
          rows = features("aws/wfs", "aws:aws_1day",
            propertyName: DAILY_FIELDS.join(","),
            cql_filter: "code=#{code} AND timestamp >= '#{since.iso8601}T00:00:00Z'",
            sortBy: "timestamp A", count: 400)
          ok(rows.map { |feature| daily_row(feature.fetch("properties")) }.sort_by { |row| row[:date] })
        rescue Faraday::Error, JSON::ParserError, KeyError, TypeError, ArgumentError => error
          upstream_error("daily #{code}", error)
        end

        def daily_row(props)
          sun = number(props["sun_duration"]) # minutes
          {
            date: props.fetch("timestamp").to_s[0, 10],
            tmin_c: number(props["temp_min"]), tmax_c: number(props["temp_max"]), tavg_c: number(props["temp_avg"]),
            precip_mm: number(props["precip_quantity"]),
            soil_temp_10cm_c: number(props["temp_soil_avg_10cm"]) || number(props["temp_soil_avg_5cm"]),
            sun_hours: sun && (sun / 60.0).round(1)
          }
        end

        def features(service, typename, **params)
          query = { service: "WFS", version: "2.0.0", request: "GetFeature", typenames: typename, outputFormat: "application/json" }.merge(params)
          response = connection.get(service, query)
          raise ArgumentError, "HTTP #{response.status}" unless response.success?

          body = response.body.is_a?(String) ? JSON.parse(response.body) : response.body
          raise ArgumentError, "not a feature collection" unless body.is_a?(Hash)
          body.fetch("features")
        end

        def number(value)
          value.is_a?(Numeric) ? value.to_f.round(2) : nil
        end

        # "MONT RIGI" → "Mont Rigi", "SPA (AERODROME)" → "Spa (Aerodrome)".
        def display_name(name)
          name.to_s.strip.downcase.gsub(/(\A|[\s\-\/(])([[:alpha:]])/) { "#{$1}#{$2.upcase}" }
        end

        # Caches the data of available results only: an upstream error is
        # retried on the next request instead of being remembered.
        def cached(*parts, expires_in:)
          cache_key = [ "weather_stations", key, Digest::SHA1.hexdigest(@base_url)[0, 8], *parts ]
          hit = Rails.cache.read(cache_key)
          return ok(hit) unless hit.nil?

          result = yield
          Rails.cache.write(cache_key, result.data, expires_in:) if result.available?
          result
        end

        def ok(data) = Providers::Climate::Result.ok(data, provider: key)

        def upstream_error(what, error)
          Rails.logger.warn("[weather_stations] IRM #{what} unavailable: #{error.class}: #{error.message}")
          Providers::Climate::Result.unavailable(:upstream_error, provider: key)
        end

        def connection
          @connection ||= Faraday.new(url: "#{@base_url}/", request: { open_timeout: 3, timeout: 10 }) do |f|
            f.response :json, content_type: /\bjson\b/
            f.headers["User-Agent"] = Providers::GeoHttp::USER_AGENT
          end
        end
    end
  end
end
