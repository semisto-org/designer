module WeatherStations
  # The official weather stations around a map, and what the nearest one
  # measured in the last days: the « Stations météo proches » section of the
  # « Climat » panel, and the same facts for the AI. Output keys are
  # camelCase (JSON for the frontend).
  #
  #   WeatherStations::MapReport.new(map).as_json
  #   WeatherStations::MapReport.new(map, station: 6455).as_json  # a chosen station
  #
  # Shape:
  #   available, reason (no_location | not_configured | upstream_error),
  #   location { lng, lat }, terrainAltitudeM,
  #   stations [ { code, name, lng, lat, altitudeM, networks, daily,
  #                distanceKm, altitudeDiffM, nearest } ]   (the NEARBY nearest)
  #   observed { available, reason, station, chosen, days [ { date, tminC,
  #              tmaxC, tavgC, precipMm, soilTemp10cmC, sunHours } ],
  #              summary { lastDate, rain7Mm, rain30Mm, days7, days30,
  #              coldestNight { date, tminC }, frost7, frostNights30 } }
  #   attribution { name, url, licence }
  class MapReport
    NEARBY = 4
    DAYS_SHOWN = 7
    HISTORY_DAYS = 30
    FROST_C = 0.0
    EARTH_RADIUS_KM = 6371.0

    def initialize(map, station: nil, provider: nil, today: Date.current)
      @map = map
      @chosen_code = Integer(station, exception: false) if station.present?
      @provider = provider || Providers::WeatherStations.for(map.region)
      @today = today
    end

    def as_json(*)
      return unavailable("not_configured") unless @provider.configured?
      return unavailable("no_location") unless point

      result = @provider.stations
      return unavailable(result.reason.to_s) unless result.available?

      ranked = rank(result.data)
      {
        "available" => true,
        "location" => { "lng" => point.lng, "lat" => point.lat },
        "terrainAltitudeM" => terrain_altitude,
        "stations" => ranked.first(NEARBY).map { |station, distance| station_json(station, distance, nearest: station == ranked.first&.first) },
        "observed" => observed(ranked),
        "attribution" => @provider.attribution.stringify_keys
      }
    end

    # Every station of the provider as GeoJSON, for the map; the nearest one
    # is flagged so it can stand out.
    def stations_geojson
      return { "type" => "FeatureCollection", "features" => [], "available" => false, "reason" => "not_configured" } unless @provider.configured?

      result = @provider.stations
      return { "type" => "FeatureCollection", "features" => [], "available" => false, "reason" => result.reason.to_s } unless result.available?

      nearest = point && rank(result.data).first&.first
      {
        "type" => "FeatureCollection",
        "available" => true,
        "attribution" => @provider.attribution.stringify_keys,
        "features" => result.data.map do |station|
          {
            "type" => "Feature",
            "id" => station.code,
            "geometry" => { "type" => "Point", "coordinates" => [ station.lng, station.lat ] },
            "properties" => {
              "code" => station.code, "name" => station.name, "altitudeM" => station.altitude_m,
              "networks" => station.networks, "daily" => station.daily, "nearest" => station == nearest
            }
          }
        end
      }
    end

    private
      def point
        return @point if defined?(@point)
        @point = Providers::Climate::Point.from(@map.center)
      end

      def unavailable(reason) = { "available" => false, "reason" => reason }

      # [[station, distance_km], ...] nearest first.
      def rank(stations)
        return [] unless point
        stations.map { |station| [ station, distance_km(station) ] }.sort_by(&:last)
      end

      # The days come from the station the user chose when it publishes
      # daily data, else from the nearest station that does.
      def observed(ranked)
        chosen = ranked.find { |station, _| station.code == @chosen_code } if @chosen_code
        source = chosen if chosen&.first&.daily
        source ||= ranked.find { |station, _| station.daily }
        base = {
          "chosen" => chosen && station_json(*chosen, nearest: chosen.first == ranked.first&.first),
          "station" => source && station_json(*source, nearest: source.first == ranked.first&.first)
        }
        return base.merge("available" => false, "reason" => "no_daily_station") unless source

        result = @provider.daily(source.first.code, since: @today - HISTORY_DAYS)
        return base.merge("available" => false, "reason" => result.reason.to_s) unless result.available?

        days = result.data.select { |day| day.date < @today.iso8601 }
        base.merge(
          "available" => true,
          "days" => days.last(DAYS_SHOWN).map { |day| day_json(day) },
          "summary" => summary(days)
        )
      end

      def summary(days)
        last7 = window(days, 7)
        last30 = window(days, HISTORY_DAYS)
        coldest = last7.select(&:tmin_c).min_by(&:tmin_c)
        {
          "lastDate" => days.last&.date,
          "rain7Mm" => rain(last7),
          "rain30Mm" => rain(last30),
          "days7" => last7.size,
          "days30" => last30.size,
          "coldestNight" => coldest && { "date" => coldest.date, "tminC" => coldest.tmin_c },
          "frost7" => last7.any? { |day| day.tmin_c && day.tmin_c <= FROST_C },
          "frostNights30" => last30.count { |day| day.tmin_c && day.tmin_c <= FROST_C }
        }
      end

      # The days among the last `count` calendar days before today.
      def window(days, count)
        from = (@today - count).iso8601
        days.select { |day| day.date >= from }
      end

      def rain(days)
        values = days.filter_map(&:precip_mm)
        values.empty? ? nil : values.sum.round(1)
      end

      def day_json(day)
        {
          "date" => day.date, "tminC" => day.tmin_c, "tmaxC" => day.tmax_c, "tavgC" => day.tavg_c,
          "precipMm" => day.precip_mm, "soilTemp10cmC" => day.soil_temp_10cm_c, "sunHours" => day.sun_hours
        }
      end

      def station_json(station, distance, nearest:)
        {
          "code" => station.code, "name" => station.name, "lng" => station.lng, "lat" => station.lat,
          "altitudeM" => station.altitude_m, "networks" => station.networks, "daily" => station.daily,
          "distanceKm" => distance.round(1),
          "altitudeDiffM" => terrain_altitude && station.altitude_m && (station.altitude_m - terrain_altitude).round,
          "nearest" => nearest
        }
      end

      # The terrain's altitude when its relief was imported: the middle of
      # its range, enough to say "the station is 80 m lower".
      def terrain_altitude
        return @terrain_altitude if defined?(@terrain_altitude)
        terrain = @map.terrain
        @terrain_altitude = terrain&.ready? && terrain.z_min && terrain.z_max ? ((terrain.z_min + terrain.z_max) / 2.0).round : nil
      end

      def distance_km(station)
        rad = Math::PI / 180
        dlat = (station.lat - point.lat) * rad
        dlng = (station.lng - point.lng) * rad
        a = Math.sin(dlat / 2)**2 + Math.cos(point.lat * rad) * Math.cos(station.lat * rad) * Math.sin(dlng / 2)**2
        2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a))
      end
  end
end
