# The implementation plan of a map (« Mise en œuvre »), as read by its page,
# the editor and the MCP: the phases, what each one builds and plants, its
# workload and cost, set against the time and budget of the project sheet,
# with the advice of a garden guide (season, time, machines).
#
# What is in the plan: the work still to do (a plant not yet in the ground,
# an element marked « En projet ») and whatever was given a phase, done or
# not, so a phase shows its progress. A plant point inside a patch that
# composes the same species is left out: the patch carries its planting.
#
#   Implementation::Plan.new(map).as_json
module Implementation
  class Plan
    DESIGN_LAYERS = %w[water access structures plants animals networks].freeze

    Item = Struct.new(:id, :kind, :layer, :name, :phase_id, :done, :group_key, :label, :estimate, :price_cents, :priced, :strata, :nitrogen, keyword_init: true)

    WOODY_STRATA = %w[canopy sub_canopy shrub vine].freeze

    ELEMENTS_SQL = <<~SQL.squish.freeze
      SELECT id, kind, layer, name,
             CASE WHEN properties->>'phase_id' ~ '^[0-9]+$' THEN (properties->>'phase_id')::bigint END AS phase_id,
             properties->>'planned' = 'true' AS planned,
             CASE WHEN GeometryType(geometry) IN ('LINESTRING', 'MULTILINESTRING') THEN ST_Length(geometry::geography)
                  WHEN GeometryType(geometry) IN ('POLYGON', 'MULTIPOLYGON') THEN ST_Perimeter(geometry::geography) / 2 END AS length_m,
             CASE WHEN GeometryType(geometry) IN ('POLYGON', 'MULTIPOLYGON') THEN ST_Area(geometry::geography) END AS area_m2
      FROM map_features
      WHERE map_id = $1 AND status = 'active' AND deleted_at IS NULL AND layer = ANY($2::text[]) AND kind <> 'plant'
      ORDER BY id
    SQL

    PHASES_SQL = <<~SQL.squish.freeze
      SELECT id, CASE WHEN properties->>'phase_id' ~ '^[0-9]+$' THEN (properties->>'phase_id')::bigint END AS phase_id
      FROM map_features WHERE map_id = $1 AND kind = 'plant' AND status = 'active' AND deleted_at IS NULL
    SQL

    BUDGET_CAPS_CENTS = { "under_500" => 50_000, "up_to_2000" => 200_000, "up_to_5000" => 500_000, "up_to_15000" => 1_500_000 }.freeze
    SEASON_OF_MONTH = { 12 => "winter", 1 => "winter", 2 => "winter", 3 => "spring", 4 => "spring", 5 => "spring",
                        6 => "summer", 7 => "summer", 8 => "summer", 9 => "autumn", 10 => "autumn", 11 => "autumn" }.freeze

    attr_reader :map

    # networks: false leaves out the sensitive networks layer (pipes,
    # cables), for readers who may not see it (MCP viewers).
    def initialize(map, quantities: nil, networks: true)
      @map = map
      @quantities = quantities
      @layers = networks ? DESIGN_LAYERS : DESIGN_LAYERS - %w[networks]
    end

    def phases = @phases ||= map.implementation_phases.active.to_a

    def drafts = @drafts ||= map.implementation_phases.drafts.to_a

    def items = @items ||= element_items + plant_items

    # Elements of the design layers that read as already there (neither in
    # project nor dated nor in a phase): the person may have drawn their
    # design without marking it « En projet ».
    def drawn_as_existing_ids
      @drawn_as_existing_ids ||= element_rows.select { |row| !row["planned"] && row["phase_id"].nil? && !row["built"] }.map { _1["id"] }
    end

    def sheet
      @sheet ||= begin
        project = map.project_sheet
        time = project.section("time")
        budget = project.section("budget")
        calendar = project.section("calendar")
        { hours_per_week: time["hours_per_week"], seasons: Array(time["seasons"]), help: Array(time["help"]),
          budget_initial: budget["initial"], budget_yearly: budget["yearly"],
          start_year: calendar["start_year"], phasing: calendar["phasing"] }
      end
    end

    def as_json(*)
      by_phase = items.group_by(&:phase_id)
      known = phases.map(&:id).to_set
      phase_json = phases.map { |phase| phase_summary(phase, by_phase.fetch(phase.id, [])) }
      unassigned = items.select { |item| item.phase_id.nil? || !known.include?(item.phase_id) }
      {
        phases: phase_json,
        drafts: drafts.map { draft_json(_1) },
        unassigned: { groups: groups_json(unassigned), hours: hours_json(unassigned) },
        drawnAsExisting: drawn_as_existing_ids,
        sheet: sheet.transform_keys { _1.to_s.camelize(:lower) },
        totals: {
          hours: (phase_json.sum { _1[:hours][:total] } + hours_json(unassigned)[:estimated]).round,
          costCents: phase_json.sum { _1[:costCents] } + unassigned.sum(&:price_cents),
          done: items.count(&:done), count: items.size
        },
        advice: global_advice(phase_json)
      }
    end

    private
      def quantities = @quantities ||= PlantedQuantities.for(map)

      def element_rows
        @element_rows ||= MapFeature.connection.select_all(ELEMENTS_SQL, "implementation elements", [ map.id, PG::TextEncoder::Array.new.encode(@layers) ]).to_a.tap do |rows|
          built = map.features.where(id: rows.map { _1["id"] }).where("properties ? 'built_on'").pluck(:id).to_set
          rows.each { |row| row["built"] = built.include?(row["id"]) }
        end
      end

      def element_items
        patches = quantities.patches.index_by { _1.feature.id }
        element_rows.filter_map do |row|
          next unless row["planned"] || row["phase_id"]
          patch = patches[row["id"]]
          estimate, price, priced = patch ? patch_work(patch) : [ WorkEstimate.for_kind(row["kind"], length_m: row["length_m"], area_m2: row["area_m2"]), 0, true ]
          Item.new(id: row["id"], kind: row["kind"], layer: row["layer"], name: row["name"], phase_id: row["phase_id"],
                   done: !row["planned"], group_key: "kind:#{row['kind']}", label: nil, estimate:, price_cents: price, priced:,
                   strata: patch && (patch.lines.any? { WOODY_STRATA.include?(_1.strata) } ? "shrub" : "herbaceous"), nitrogen: false)
        end
      end

      # A patch's planting: each line of its composition, by strata.
      def patch_work(patch)
        hours = 0.0
        count = 0
        price = 0
        priced = true
        patch.lines.each do |line|
          hours += WorkEstimate.for_plants(line.strata, line.quantity).hours
          count += line.quantity
          unit = unit_price_cents(line.item.key)
          unit.nil? ? priced = false : price += unit * line.quantity
        end
        [ WorkEstimate::Estimate.new(hours: hours.round(1), machine: false, season: "dormant", per: "each", quantity: count), price, priced ]
      end

      def plant_items
        phase_of = MapFeature.connection.select_rows(PHASES_SQL, "plant phases", [ map.id ]).to_h
        names = species_names
        quantities.plants.filter_map do |plant|
          phase_id = phase_of[plant.id]
          next if plant.planted_on && phase_id.nil?
          next if plant.in_patch && phase_id.nil?
          key = [ plant.species_id, plant.variety_id ]
          strata = plant.species_id && quantities.strata_for(key)
          unit = plant.species_id && unit_price_cents(key)
          Item.new(id: plant.id, kind: "plant", layer: "plants", name: nil, phase_id:, done: plant.planted_on.present?,
                   group_key: "plant:#{plant.species_id}-#{plant.variety_id}", label: names[key] || names[[ plant.species_id, nil ]],
                   estimate: WorkEstimate.for_plants(strata || "shrub", plant.in_patch ? 0 : 1), price_cents: unit.to_i, priced: !unit.nil?,
                   strata: strata || "shrub", nitrogen: plant.species_id && quantities.species_index[plant.species_id]&.nitrogen_fixer? || false)
        end
      end

      def species_names
        names = quantities.species_index.to_h { |id, s| [ [ id, nil ], s.common_name.presence || s.latin_name ] }
        quantities.variety_index.each_value do |v|
          names[[ v.species_id, v.id ]] = v.common_name.presence || "#{names[[ v.species_id, nil ]]} '#{v.name}'"
        end
        names
      end

      def unit_price_cents(key)
        @prices ||= quantities.palette.each_with_object({}) { |item, h| h[item.key] = (item.unit_price.to_f * 100).round if item.unit_price }
        @prices[key] || @prices[[ key.first, nil ]]
      end

      def phase_summary(phase, items)
        hours = hours_json(items, override: phase.hours_override)
        plants_cost = items.sum(&:price_cents)
        cost = plants_cost + phase.other_costs_cents.to_i
        {
          id: phase.id, name: phase.name, key: phase.key, startsOn: phase.starts_on.iso8601, endsOn: phase.ends_on.iso8601,
          notes: phase.notes, hoursOverride: phase.hours_override, otherCostsCents: phase.other_costs_cents, lockVersion: phase.lock_version,
          groups: groups_json(items), hours:, plantsCostCents: plants_cost, unpricedPlants: items.count { !_1.priced },
          costCents: cost, done: items.count(&:done), count: items.size,
          available: available_hours(phase), advice: phase_advice(phase, items, hours)
        }
      end

      # An AI's proposed phase, with the elements it would take.
      def draft_json(phase)
        ids = phase.proposed_feature_ids.to_set
        items = self.items.select { ids.include?(_1.id) }
        {
          id: phase.id, name: phase.name, startsOn: phase.starts_on.iso8601, endsOn: phase.ends_on.iso8601,
          notes: phase.notes, rationale: phase.rationale, source: phase.source,
          groups: groups_json(items), hours: hours_json(items), costCents: items.sum(&:price_cents)
        }
      end

      def hours_json(items, override: nil)
        todo = items.reject(&:done)
        estimated = todo.sum { _1.estimate.hours.to_f }.round(1)
        { estimated:, total: (override || estimated).to_f, unestimated: todo.count { !_1.estimate.known? }, machine: todo.count { _1.estimate.machine } }
      end

      def groups_json(items)
        items.group_by(&:group_key).map do |key, group|
          first = group.first
          {
            key:, kind: first.kind, layer: first.layer, label: first.label, names: group.filter_map(&:name).uniq.first(3),
            count: group.size, done: group.count(&:done), featureIds: group.map(&:id),
            quantity: group.sum { _1.estimate.quantity.to_f }.round(1), per: first.estimate.per,
            hours: group.reject(&:done).sum { _1.estimate.hours.to_f }.round(1),
            machine: first.estimate.machine, unknown: !first.estimate.known?, season: first.estimate.season
          }
        end.sort_by { |g| [ DESIGN_LAYERS.index(g[:layer]) || 99, -g[:count] ] }
      end

      def available_hours(phase)
        per_week = sheet[:hours_per_week]
        return nil if per_week.nil?
        { perWeek: per_week, hours: (per_week * phase.weeks).round }
      end

      def phase_advice(phase, items, hours)
        advice = []
        months = phase.months.map(&:last).to_set
        todo = items.reject(&:done)
        todo.group_by { _1.estimate.season }.each do |season, group|
          next if season == "any" || WorkEstimate.months(season).any? { months.include?(_1) }
          advice << { code: "season", season:, count: group.size }
        end
        machines = todo.count { _1.estimate.machine }
        advice << { code: "machine", count: machines } if machines.positive?
        if (per_week = sheet[:hours_per_week]) && hours[:total].positive?
          available = per_week * phase.weeks
          advice << { code: "time", weeks: (hours[:total] / [ per_week, 1 ].max).ceil, available: available.round } if hours[:total] > available
        end
        seasons = sheet[:seasons]
        if seasons.any? && months.none? { seasons.include?(SEASON_OF_MONTH[_1]) }
          advice << { code: "availability", seasons: }
        end
        advice
      end

      def global_advice(phase_json)
        advice = []
        advice << { code: "drawn_as_existing", count: drawn_as_existing_ids.size } if drawn_as_existing_ids.any?
        cap = BUDGET_CAPS_CENTS[sheet[:budget_initial]]
        if cap && phases.any?
          first_year_end = phases.first.starts_on + 1.year
          first_year = phase_json.select { Date.iso8601(_1[:startsOn]) < first_year_end }.sum { _1[:costCents] }
          advice << { code: "budget", costCents: first_year, capCents: cap } if first_year > cap
        end
        advice
      end
  end
end
