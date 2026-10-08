class ObservedClimate
  # The climate observed at a map's place over 1995-2024 (ERA5-Land), for
  # the "Climat" panel and the AI. Starts the computation of the map's grid
  # cell when nobody asked for it yet; meanwhile the status is "pending".
  #
  #   { available: false, reason: "not_configured" | "no_location" }
  #   { available: true, status: "pending" | "failed" | "ready",
  #     period: { firstYear, lastYear }, gridKm: 9, computedAt,
  #     data: { years, annual: {...}, zone, months: [...], frost: {...}, trend: {...} },  # when ready
  #     source: { key, publisher, title, licence, url, doi, year } }
  #
  # Output keys are camelCase (JSON for the frontend). Only the grid cell is
  # stored and shown, never the map's exact location.
  class MapReport
    GRID_KM = 9

    def initialize(map, provider: Providers::Era5Land.from_env)
      @map = map
      @provider = provider
    end

    def point = @point ||= Providers::Climate::Point.from(@map.center)

    def record
      return @record if defined?(@record)
      @record = @provider.configured? && point ? ObservedClimate.ensure_for(point) : nil
    end

    def as_json(*)
      return { available: false, reason: "not_configured" } unless @provider.configured?
      return { available: false, reason: "no_location" } unless point

      camelize(
        available: true,
        status: record.status,
        period: { first_year: record.first_year, last_year: record.last_year },
        grid_km: GRID_KM,
        computed_at: record.computed_at&.iso8601,
        data: record.ready? ? record.indicators : nil,
        source: Providers::Era5Land::ATTRIBUTION.merge(year: (record.computed_at || Time.current).year)
      )
    end

    private
      def camelize(value)
        case value
        when Hash then value.to_h { |key, item| [ key.to_s.camelize(:lower), camelize(item) ] }
        when Array then value.map { camelize(_1) }
        else value
        end
      end
  end
end
