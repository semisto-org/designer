module Climate
  # Everything the "Climat" panel shows for a map: today's normals and
  # hardiness zone, the projected zones for 2050 and 2080 under two
  # scenarios, and a check of each plant of the map against them.
  #
  # Projections and plant checks are paid analyses: without
  # Entitlements#analyses? the report only carries the current climate and
  # says what is locked. Output keys are camelCase (JSON for the frontend).
  class MapReport
    HORIZONS = Providers::Climate::Provider::HORIZONS
    SCENARIOS = Providers::Climate::Provider::SCENARIOS

    def initialize(map, provider: nil, entitlements: nil, inventory: nil)
      @map = map
      @provider = provider || Providers::Climate.for(map.region)
      @entitlements = entitlements || Entitlements.for_map(map)
      @inventory = inventory || MapPlantInventory.new(map)
    end

    def entitled? = @entitlements.analyses?

    def point = @point ||= Providers::Climate::Point.from(@map.center)

    def current = @current ||= @provider.current_normals(point)

    # { "2050" => { "moderate" => Result, "high" => Result }, "2080" => ... }
    def projections
      @projections ||= HORIZONS.index_with do |horizon|
        SCENARIOS.index_with { |scenario| @provider.projection(point, horizon:, scenario:) }
      end
    end

    def as_json(*)
      camelize(
        location: point && { lng: point.lng.round(4), lat: point.lat.round(4) },
        entitled: entitled?,
        capabilities: @provider.capabilities,
        current: result_json(current),
        projections: projections_json,
        plants: plants_json,
        sources: sources
      )
    end

    private
      def result_json(result)
        result.available? ? { available: true, **result.data } : { available: false, reason: result.reason }
      end

      def projections_json
        return { locked: true } unless entitled?
        sample = projections.values.flat_map(&:values).first
        return { available: false, reason: sample.reason } unless sample.available?

        {
          available: true,
          scenarios: SCENARIOS.map { |key| { key:, ipcc: projections.dig(HORIZONS.first, key)&.data&.dig(:ipcc) } },
          horizons: projections.transform_values { |by_scenario| by_scenario.transform_values { result_json(_1) } }
        }
      end

      def plants_json
        lines = @inventory.lines
        return { locked: true, count: lines.size } unless entitled?
        return { available: false, reason: current.reason, count: lines.size } unless current.available?

        items = lines.map { plant_json(_1) }
        { available: true, count: items.size, items:, summary: summary(items) }
      end

      def plant_json(line)
        traits = PlantTraits.from(line.species)
        check = PlantCheck.new(traits)
        {
          key: line.key,
          name: line.display_name,
          latin_name: line.latin_name,
          quantity: line.quantity,
          cold_limit_c: traits.cold_limit_c&.round(1),
          max_zone: traits.max_zone&.code,
          drought: traits.drought,
          traits_known: traits.known?,
          today: check.today(current.data[:normals]),
          future: projections.transform_values do |by_scenario|
            by_scenario.transform_values { |result| result.available? ? check.future(result.data) : nil }
          end
        }
      end

      # Number of plants per status, today and for each horizon/scenario.
      def summary(items)
        {
          today: items.map { _1[:today][:status] }.tally,
          future: HORIZONS.index_with do |horizon|
            SCENARIOS.index_with { |scenario| items.filter_map { _1.dig(:future, horizon, scenario, :status) }.tally }
          end
        }
      end

      def sources
        results = [ current, *(entitled? ? projections.values.flat_map(&:values) : []) ]
        results.select(&:available?).flat_map { Array(_1.data[:sources]) }.uniq { _1[:key] }
      end

      # Symbol keys (structure, snake_case) become camelCase strings; string
      # keys are data ("2050", "moderate", status names) and stay as they are.
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
