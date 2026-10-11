class Offer
  # What the map knows that an offer is priced on: the place's area, the
  # surfaces and lengths of the elements in the scope, the plants they
  # become, and the hints the map and the project sheet give the team
  # (a pond is drawn, the access is narrow…). Read live while the offer is
  # worked on, frozen into each saved version (#to_h).
  class Measures
    POLYGONS = %w[ST_Polygon ST_MultiPolygon].freeze
    LINES = %w[ST_LineString ST_MultiLineString].freeze

    FEATURES_SQL = <<~SQL.squish.freeze
      SELECT id, name, kind, layer, ST_GeometryType(geometry) AS type,
             CASE WHEN ST_GeometryType(geometry) IN ('ST_Polygon', 'ST_MultiPolygon') THEN ST_Area(geometry::geography) END AS area,
             CASE WHEN ST_GeometryType(geometry) IN ('ST_LineString', 'ST_MultiLineString') THEN ST_Length(geometry::geography) END AS length
      FROM map_features
      WHERE map_id = $1 AND status = 'active' AND layer <> 'networks'
        AND ST_GeometryType(geometry) IN ('ST_Polygon', 'ST_MultiPolygon', 'ST_LineString', 'ST_MultiLineString')
      ORDER BY id
    SQL

    # Budget brackets of the project sheet, as their upper bound in € TVAC.
    BUDGET_CEILINGS = { "under_500" => 500, "up_to_2000" => 2_000, "up_to_5000" => 5_000, "up_to_15000" => 15_000 }.freeze
    DIFFICULT_ACCESS = %w[narrow no_vehicle steep_path far_from_home].freeze

    # The measures of a saved version, read back as they were.
    class Frozen
      def initialize(hash) = @hash = hash
      def to_h = @hash
      def scope = @hash.fetch("scope", [])
      def drivers = @hash.fetch("drivers", {})
      def service?(key) = @hash.dig("services", key) || false
      def budget_ceiling = @hash["budget_ceiling"]
    end

    attr_reader :map, :inputs

    # A plain hash (a version's frozen measures) or a map.
    def self.from_h(hash) = Frozen.new(hash)

    def initialize(map, inputs)
      @map = map
      @inputs = inputs
    end

    def site_area_m2 = map.area_m2&.to_f

    # Elements of the map an offer can be priced on: surfaces and lines.
    def candidates
      @candidates ||= MapFeature.connection.select_all(FEATURES_SQL, "offer candidates", [ map.id ]).map do |row|
        {
          "id" => row["id"], "name" => row["name"], "kind" => row["kind"], "layer" => row["layer"],
          "measure_kind" => POLYGONS.include?(row["type"]) ? "area" : "length",
          "measure" => (row["area"] || row["length"]).to_f.round(1)
        }
      end
    end

    # The scope of the offer, resolved: each element's measure (from the map
    # when it is drawn, else typed) and the plants it becomes per category.
    def scope
      @scope ||= begin
        by_id = candidates.index_by { _1["id"] }
        inputs["scope"].map do |item|
          feature = by_id[item["feature_id"]]
          type = Catalog::PLANTING_TYPES.fetch(item["planting_type"])
          measure = feature ? feature["measure"] : item["measure"].to_f
          plants = type[:mix].transform_values { (_1 * measure).round }
          if (override = item["plants_override"])
            plants = scale(plants, override)
          end
          {
            "id" => item["id"], "feature_id" => feature && feature["id"], "missing" => item["feature_id"].present? && feature.nil?,
            "label" => item["label"].presence || feature&.dig("name").presence,
            "kind" => feature&.dig("kind"), "planting_type" => item["planting_type"],
            "measure_kind" => type[:measure], "measure" => measure.round(1),
            "plants" => plants, "plants_total" => plants.values.sum, "option" => item["option"]
          }
        end
      end
    end

    def drivers
      base = scope.reject { _1["option"] }
      options = scope.select { _1["option"] }
      plants = base.sum { _1["plants_total"] }
      {
        "site_ha" => (site_area_m2.to_f / 10_000).round(2),
        "items" => scope.size,
        "plants" => plants,
        "option_plants" => options.sum { _1["plants_total"] },
        "planting_days" => plants.zero? ? 0 : (plants / inputs.dig("settings", "plants_per_day").to_f).ceil
      }
    end

    # Services the map or the project sheet points to, with the reason.
    def suggestions
      @suggestions ||= begin
        sheet = map.project_sheet
        counts = map.features.active.group(:kind).count
        hints = {}
        hints["pond"] = "pond_drawn" if counts["pond"].to_i.positive?
        hints["existing_trees"] = "existing_trees_drawn" if counts["existing_tree"].to_i.positive?
        hints["existing_trees"] ||= "existing_trees_sheet" if Array(sheet.section("opportunities")["items"]).include?("existing_trees")
        hints["co_author"] = "co_author_sheet" if Array(sheet.section("who")["people"]).size > 1
        hints["soil_analysis"] = "soil_unknown" if Array(sheet.section("constraints")["soil"]).include?("unknown") || sheet.section("constraints")["soil"].blank?
        hints["harvest_table"] = "food_goal" if sheet.section("ambitions")["main_goal"] == "food_autonomy"
        hints["wildlife"] = "biodiversity_goal" if Array(sheet.section("ambitions")["goals"]).include?("biodiversity")
        hints
      end
    end

    # Adjustments the project sheet points to.
    def adjustment_hints
      constraints = map.project_sheet.section("constraints")
      hints = {}
      hints["difficult_access"] = "access" if (Array(constraints["access"]) & DIFFICULT_ACCESS).any?
      hints["steep_slope"] = "slope" if constraints["slope"] == "steep"
      hints
    end

    # A service is on when the team said so, else when a hint suggests it.
    def service?(key)
      decided = inputs["services"][key]
      decided.nil? ? suggestions.key?(key) : decided
    end

    def budget_ceiling = BUDGET_CEILINGS[map.project_sheet.section("budget")["initial"]]

    def lead_name
      people = Array(map.project_sheet.section("who")["people"])
      (people.find { _1["role"] == "lead" } || people.first)&.dig("name")
    end

    def to_h
      {
        "site_area_m2" => site_area_m2, "scope" => scope, "drivers" => drivers,
        "services" => Catalog::SERVICES.index_with { service?(_1) },
        "suggestions" => suggestions, "adjustment_hints" => adjustment_hints,
        "budget_ceiling" => budget_ceiling, "lead_name" => lead_name
      }
    end

    private
      # Spreads a total over the categories in the same proportions.
      def scale(plants, total)
        sum = plants.values.sum
        return plants.transform_values { 0 }.merge(plants.keys.first => total) if sum.zero? && plants.any?
        return plants if sum.zero?
        scaled = plants.transform_values { (_1 * total / sum.to_f).floor }
        scaled[plants.max_by { _2 }.first] += total - scaled.values.sum
        scaled
      end
  end
end
