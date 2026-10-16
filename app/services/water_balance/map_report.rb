module WaterBalance
  # The water balance of a map's place (WaterBalance::Model), for the
  # « Climat » panel and the AI: the observed climate (ERA5-Land, 1995-2024),
  # the same with the 2050 climate of the region (median of the moderate
  # scenario: warmer, drier summers), and what the map already holds to
  # face it (tanks, roofs, ponds, swales).
  #
  #   { available: false, reason: "not_configured" | "no_location" }
  #   { available: true, status: "pending" | "failed" }
  #   { available: true, status: "ready", soil:, reserveMm:, observed: {...}, future: {...} | nil, storage: {...} }
  class MapReport
    # Useful reserve of the root zone (mm over about a metre of soil), by
    # soil kind of the map's water settings: indicative, for a soil that is
    # not waterlogged.
    RESERVE_MM = { "sandy" => 70, "stony" => 90, "loam" => 150, "clay" => 170 }.freeze
    DEFAULT_RESERVE_MM = 120
    SUMMER = [ 6, 7, 8 ].freeze
    FUTURE = { horizon: "2050", scenario: "moderate" }.freeze

    def initialize(map, observed: ObservedClimate::MapReport.new(map))
      @map = map
      @observed = observed
    end

    def as_json(*)
      report = @observed.as_json.deep_stringify_keys
      return report.slice("available", "reason").symbolize_keys unless report["available"]
      return { available: true, status: report["status"] } unless report["status"] == "ready" && months.size == 12

      settings = @map.effective_water_settings
      soil = settings["soil"]
      reserve = RESERVE_MM.fetch(soil, DEFAULT_RESERVE_MM) * 1.0
      observed = Model.new(months:, latitude:, reserve_mm: reserve).call
      camelize(
        available: true, status: "ready", soil:, reserve_mm: reserve.round,
        period: report["period"], source: report["source"],
        observed:, future: future(reserve),
        storage: storage(observed, settings)
      )
    end

    private
      def months
        @months ||= Array(@observed.record&.indicators&.dig("months"))
      end

      def latitude = @observed.point.lat

      # The 2050 climate: monthly temperatures + the median warming, summer
      # rain changed by the median of the region's projections.
      def future(reserve)
        deltas = @map.region&.setting("climate")&.dig("projections", "horizons", FUTURE[:horizon], FUTURE[:scenario])
        warming = Array(deltas&.dig("mean_temp_delta_c"))[1]
        summer_rain = Array(deltas&.dig("summer_precip_change_pct"))[1]
        return nil unless warming && summer_rain

        shifted = months.map do |m|
          m = m.transform_keys(&:to_s)
          factor = SUMMER.include?(m["month"].to_i) ? 1 + summer_rain / 100.0 : 1
          m.merge(
            "rain_mm" => m["rain_mm"].to_f * factor,
            "mean_temp_c" => m["mean_temp_c"].to_f + warming,
            "mean_min_c" => m["mean_min_c"].to_f + warming,
            "mean_max_c" => m["mean_max_c"].to_f + warming
          )
        end
        Model.new(months: shifted, latitude:, reserve_mm: reserve).call.merge(
          horizon: FUTURE[:horizon], scenario: FUTURE[:scenario], warming_c: warming, summer_rain_pct: summer_rain
        )
      end

      # What the map holds: tanks and the roofs' summer rain for watering,
      # ponds, swales and rain gardens for keeping water on the land.
      def storage(observed, settings)
        features = @map.features.active
        tanks_l = features.where(kind: "water_tank").sum { |f| f.properties.to_h["capacity_l"].to_f }
        roof = Relief::Rainwater.new(@map, settings:).call
        summer_rain = observed[:months].select { SUMMER.include?(_1[:month]) }.sum { _1[:rain_mm] }
        roof_summer_m3 = Relief::Rainwater.volume_m3(roof[:roofAreaM2], summer_rain, settings["roof_coefficient"].to_f)
        works_m3 = features.where(kind: MapFeature::WaterCapacity::WATER_CAPACITY_KINDS).sum { |f| f.water_capacity_m3.to_f }
        area = @map.area_m2.to_f
        deficit = observed[:annual][:deficit_mm]
        watering_m3 = tanks_l / 1000.0 + roof_summer_m3
        {
          area_m2: area.round,
          tanks_m3: (tanks_l / 1000.0).round(1),
          roof_area_m2: roof[:roofAreaM2],
          roof_summer_m3: roof_summer_m3.round(1),
          works_m3: works_m3.round(1),
          winter_surplus_m3: (area * observed[:annual][:surplus_mm] / 1000.0).round,
          deficit_m3: (area * deficit / 1000.0).round,
          # The area that the tanks and the summer roof water can carry
          # through the dry months (litres / mm of deficit).
          watered_m2: deficit.positive? ? (watering_m3 * 1000 / deficit).round : nil
        }
      end

      def camelize(value)
        case value
        when Hash then value.to_h { |key, item| [ key.to_s.camelize(:lower), camelize(item) ] }
        when Array then value.map { camelize(_1) }
        else value
        end
      end
  end
end
