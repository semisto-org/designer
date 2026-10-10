module Sun
  # Everything the "Soleil" panel shows for a map, and what an AI agent can
  # read about the sun on a terrain:
  #
  # - the horizon profile seen from the map's centre (PVGIS, computed from a
  #   ~90 m elevation model: relief only, no trees, no buildings);
  # - the sun's path on the winter solstice, the March equinox and the
  #   summer solstice (computed here, NOAA algorithm, local solar time);
  # - for the 21st of each month, the hours of direct sun over this horizon
  #   versus a flat open horizon;
  # - the monthly irradiation on a horizontal plane, horizon included
  #   (PVGIS, average over its database years).
  #
  # The sun paths and the open-horizon hours only need a location: they stay
  # when PVGIS is off or down, and the PVGIS blocks say why they are missing.
  # Output keys are camelCase (JSON for the frontend).
  class MapReport
    REASONS = %i[no_location not_configured out_of_coverage upstream_error].freeze
    PATH_DAYS = { "winter_solstice" => [ 12, 21 ], "equinox" => [ 3, 20 ], "summer_solstice" => [ 6, 21 ] }.freeze
    PVGIS_URL = "https://joint-research-centre.ec.europa.eu/photovoltaic-geographical-information-system-pvgis_en".freeze

    def initialize(map, provider: nil, year: Date.current.year)
      @map = map
      @provider = provider || Providers::Pvgis.build
      @year = year
    end

    def point = @point ||= Providers::Climate::Point.from(@map.center)

    def horizon
      return @horizon if defined?(@horizon)
      @horizon = point && pvgis { @provider.horizon(point) }
    end

    def irradiation
      return @irradiation if defined?(@irradiation)
      @irradiation = point && pvgis { @provider.monthly_irradiation(point) }
    end

    def as_json(*)
      return camelize(location: nil, available: false, reason: :no_location) unless point

      camelize(
        location: { lng: point.lng.round(4), lat: point.lat.round(4) },
        available: true,
        horizon: horizon_json,
        paths: PATH_DAYS.map { |key, (month, day)| path_json(key, day_at(month, day)) },
        months: (1..12).map { |month| month_json(month) },
        irradiation: irradiation_json,
        sources:
      )
    end

    private
      # Runs a PVGIS call; on failure keeps the reason instead of the data.
      def pvgis
        yield
      rescue Providers::Pvgis::Unavailable => error
        reason = REASONS.include?(error.reason) ? error.reason : :upstream_error
        Rails.logger.info("[sun] PVGIS unavailable for map #{@map.id}: #{error.message}")
        reason
      end

      def available?(value) = value && !value.is_a?(Symbol)

      def profile = available?(horizon) ? HorizonProfile.new(horizon.profile) : nil

      def day_at(month, day)
        Day.new(lat: point.lat, lng: point.lng, date: Date.new(@year, month, day), horizon: (@profile ||= profile)&.to_proc)
      end

      def horizon_json
        return { available: false, reason: horizon } unless available?(horizon)

        { available: true, **horizon.as_json }
      end

      def path_json(key, day)
        {
          key:, date: day.date.iso8601,
          noon_elevation: day.noon_elevation.round(1),
          open_hours: hours(day.open_minutes),
          terrain_hours: hours(day.terrain_minutes),
          first_sun: day.first_sun, last_sun: day.last_sun,
          points: day.path
        }
      end

      def month_json(month)
        day = day_at(month, 21)
        {
          month:, date: day.date.iso8601,
          open_hours: hours(day.open_minutes),
          terrain_hours: hours(day.terrain_minutes),
          first_sun: day.first_sun, last_sun: day.last_sun,
          irradiation_kwh_m2: available?(irradiation) ? irradiation.monthly[month - 1] : nil
        }
      end

      def irradiation_json
        return { available: false, reason: irradiation } unless available?(irradiation)

        {
          available: true,
          annual_kwh_m2: irradiation.monthly.compact.sum.round,
          year_min: irradiation.year_min, year_max: irradiation.year_max,
          database: irradiation.database
        }
      end

      def hours(minutes) = minutes && (minutes / 60.0).round(2)

      def sources
        list = [ { key: "noaa", publisher: "NOAA", title: "Solar Calculator (Meeus)", licence: nil, url: "https://gml.noaa.gov/grad/solcalc/calcdetails.html" } ]
        if available?(horizon) || available?(irradiation)
          list << { key: "pvgis", publisher: @provider.attribution, title: pvgis_title, licence: "free_with_attribution", url: PVGIS_URL }
        end
        list
      end

      def pvgis_title
        return "PVGIS 5.3" unless available?(irradiation)

        "PVGIS 5.3 · #{[ irradiation.database, "#{irradiation.year_min}-#{irradiation.year_max}" ].compact.join(" ")}"
      end

      # Symbol keys become camelCase strings; symbol values become strings.
      def camelize(value)
        case value
        when Hash then value.to_h { |key, item| [ key.is_a?(Symbol) ? key.to_s.camelize(:lower) : key, camelize(item) ] }
        when Array then value.map { camelize(_1) }
        when Symbol then value.to_s
        else value
        end
      end
  end
end
