module Climate
  # The 7-day forecast for a map, with what it means for the garden:
  # frost and heat days, and the plants whose cold limit the forecast
  # reaches. Output keys are camelCase (JSON for the frontend).
  class ForecastReport
    FROST_C = 0.0
    HEAT_C = 30.0

    def initialize(map, provider: nil, inventory: nil)
      @map = map
      @provider = provider || Providers::Climate.for(map.region)
      @inventory = inventory || MapPlantInventory.new(map)
    end

    def as_json(*)
      result = @provider.forecast(@map.center)
      return { "available" => false, "reason" => result.reason.to_s, "supported" => @provider.supports?(:forecast) } unless result.available?

      days = result.data[:days]
      {
        "available" => true,
        "supported" => true,
        "days" => days.map { |day| day.transform_keys { _1.to_s.camelize(:lower) } },
        "alerts" => alerts(days),
        "attribution" => result.data[:attribution]&.stringify_keys,
        "fetchedAt" => result.data[:fetched_at]
      }
    end

    private
      def alerts(days)
        frost = days.select { (t = _1[:tmin_c]) && t <= FROST_C }
        heat = days.select { (t = _1[:tmax_c]) && t >= HEAT_C }
        list = []
        if frost.any?
          coldest = frost.min_by { _1[:tmin_c] }
          list << { "kind" => "frost", "dates" => frost.map { _1[:date] }, "minC" => coldest[:tmin_c], "plants" => plants_at(coldest[:tmin_c]) }
        end
        list << { "kind" => "heat", "dates" => heat.map { _1[:date] }, "maxC" => heat.map { _1[:tmax_c] }.max } if heat.any?
        list
      end

      # Plants whose cold limit is at or above the forecast minimum.
      def plants_at(min_c)
        @inventory.lines.filter_map do |line|
          limit = PlantTraits.from(line.species).cold_limit_c
          { "name" => line.display_name, "coldLimitC" => limit.round(1) } if limit && limit >= min_c
        end
      end
  end
end
