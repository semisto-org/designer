class Offer
  # A way of pricing a forest-garden project, as data: the rates, the tasks
  # of each phase with the hours they take and the time the Designer saves
  # on them, the expenses, the plant categories and planting types that
  # turn a surface or a length into plants, how complexity is scored, and
  # the terms written in the offer. Semisto's own (SEMISTO, calibrated on
  # the Erpent offer) is the default; any professional or team copies it
  # into an OfferTemplate and makes it theirs.
  #
  # The vocabulary stays fixed so the map can feed it: the three phases,
  # the services the internal sheet switches on, and the drivers read from
  # the map (Offer::Measures):
  #   site_ha        area of the whole place, in hectares
  #   items          elements in the scope of the offer (base and options)
  #   plants         plants of the base scope
  #   option_plants  plants of the optional scope
  #   planting_days  days of collective planting (plants ÷ plants per day)
  #
  # Hours of a task = (base + per × driver) × (1 − gain), to the half hour.
  # `persons` is a number, or "designers" for the tasks the whole design
  # team does together. `when` names the service or the condition that
  # brings the task in; `option` tasks are in the maximum only.
  #
  # Labels of Semisto's keys are in config/locales/offers.fr.yml; a team's
  # own tasks, categories and types carry their label.
  class Pricing
    PHASES = %w[pre_design design implementation].freeze
    SERVICES = %w[co_author soil_analysis existing_trees sun_study expert_opinion wildlife pond mushrooms harvest_table].freeze
    DRIVERS = %w[site_ha items plants option_plants planting_days].freeze
    CONDITIONS = [ "two_designers", "option_scope", *SERVICES ].freeze
    SUPPLY_KEYS = %w[mulch_m2 compost_l guard stake].freeze
    MEASURES = %w[area length].freeze
    # Who the client is, as the project sheet says it.
    CLIENT_TYPES = %w[individual collective school business farm commune other].freeze
    KEY = /\A[a-z][a-z0-9_]{0,40}\z/

    # Rates and settings: [default, min, max]. An offer starts from its
    # template's values and the team can change them per offer.
    SETTINGS = {
      "designers" => [ 1, 1, 2 ],
      "hourly_rate" => [ 60, 0, 1_000 ],
      "contribution_pct" => [ 15, 0, 100 ],
      "buffer_pct" => [ 20, 0, 100 ],
      "km_rate" => [ 0.47, 0, 10 ],
      "plants_per_day" => [ 300, 10, 10_000 ],
      "plants_margin_pct" => [ 30, 0, 300 ],
      "vat_services_pct" => [ 21, 0, 100 ],
      "vat_plants_pct" => [ 6, 0, 100 ],
      "vat_supplies_pct" => [ 21, 0, 100 ],
      "rounding" => [ 5, 1, 1_000 ],
      "co_management_half_days" => [ 10, 0, 365 ],
      "half_day_hours" => [ 4, 1, 12 ]
    }.freeze

    task = ->(key, phase, base: 0, per: 0, driver: nil, persons: 1, when: nil, option: false, gain: 0) do
      { "key" => key, "phase" => phase, "label" => nil, "persons" => persons, "base" => base, "per" => per,
        "driver" => driver, "when" => binding.local_variable_get(:when), "option" => option, "gain_pct" => gain }
    end
    category = ->(key, price, mulch, compost, guard, stake) do
      { "key" => key, "label" => nil, "price" => price, "mulch_m2" => mulch, "compost_l" => compost, "guard" => guard, "stake" => stake }
    end
    type = ->(key, measure, mix) { { "key" => key, "label" => nil, "measure" => measure, "mix" => mix } }

    # Semisto's pricing. Hours come from the Erpent spreadsheet (made before
    # the Designer). Gains are what the Designer saves on a task: the place
    # read from its layers, relief and data, sketches on photos, the plant
    # list and the harvest calendar from the palette, the offer itself.
    SEMISTO = JSON.parse({
      "settings" => SETTINGS.transform_values(&:first),
      "tasks" => [
        # Pré-design: dream the project together, read the land, a plan of zones.
        task.("offer", "pre_design", base: 3, persons: "designers", gain: 30),
        task.("interview", "pre_design", base: 2.5, persons: "designers"),
        task.("site_analysis", "pre_design", base: 2, per: 0.33, driver: "site_ha", persons: "designers", gain: 40),
        task.("research", "pre_design", base: 2, persons: "designers", gain: 30),
        task.("functional_analysis", "pre_design", base: 1.5, persons: "designers"),
        task.("elements_flows", "pre_design", base: 1, persons: "designers"),
        task.("team_sync", "pre_design", base: 1, persons: "designers", when: "two_designers"),
        task.("zone_plan", "pre_design", base: 2, per: 0.25, driver: "items", gain: 25),
        task.("photo_sketches", "pre_design", base: 5, gain: 40),
        task.("peer_review", "pre_design", base: 1, persons: "designers"),
        task.("presentation_prep", "pre_design", base: 1),
        task.("presentation", "pre_design", base: 2, persons: "designers"),
        task.("co_author_coaching", "pre_design", base: 3, when: "co_author"),
        task.("validation_document", "pre_design", base: 1.5, persons: "designers", gain: 25),
        task.("project_management", "pre_design", base: 5),
        # Design: the plant palette and the planting plan, ready to plant.
        task.("existing_trees_survey", "design", base: 5, when: "existing_trees", gain: 40),
        task.("sun_study", "design", base: 5, when: "sun_study", gain: 60),
        task.("plant_palette", "design", base: 3, gain: 30),
        task.("expert_opinion", "design", base: 2, when: "expert_opinion"),
        task.("planting_plan", "design", base: 2, per: 0.02, driver: "plants", gain: 30),
        task.("option_planting_plan", "design", per: 0.02, driver: "option_plants", when: "option_scope", option: true, gain: 30),
        task.("wildlife", "design", base: 2, when: "wildlife", option: true),
        task.("pond_design", "design", base: 4, when: "pond", option: true),
        task.("mushrooms_design", "design", base: 1, when: "mushrooms", option: true),
        task.("harvest_table", "design", base: 3, when: "harvest_table", gain: 60),
        task.("co_author_coaching", "design", base: 3, when: "co_author"),
        task.("peer_review", "design", base: 1),
        task.("presentation", "design", base: 2),
        task.("project_management", "design", base: 3),
        # Mise en œuvre: collective plantings with the people of the place.
        task.("planting_days", "implementation", base: 8, per: 6, driver: "planting_days"),
        task.("staking", "implementation", base: 1, per: 0.004, driver: "plants", persons: 2),
        task.("mushrooms_workshop", "implementation", base: 4, persons: 2, when: "mushrooms", option: true),
        task.("pond_works", "implementation", base: 24, when: "pond", option: true)
      ],
      "expenses" => [
        { "key" => "soil_analysis", "phase" => "pre_design", "label" => nil, "amount" => 150, "when" => "soil_analysis", "option" => false },
        { "key" => "printing", "phase" => "design", "label" => nil, "amount" => 50, "when" => nil, "option" => false },
        { "key" => "pond_supplies", "phase" => "implementation", "label" => nil, "amount" => 2_500, "when" => "pond", "option" => true },
        { "key" => "mushrooms_supplies", "phase" => "implementation", "label" => nil, "amount" => 150, "when" => "mushrooms", "option" => true }
      ],
      # Price per plant (€ HTVA) and supplies per plant.
      "categories" => [
        category.("fruit_tree", 25, 1, 3, 1, 1),
        category.("shrub", 10, 1, 3, 1, 1),
        category.("forest_tree", 5.33, 1, 3, 1, 1),
        category.("hedge_evergreen", 6, 0.8, 0.75, 0, 0),
        category.("hedge_fruit", 12, 0.8, 0.75, 0, 0),
        category.("herbaceous", 6, 0.2, 1, 0, 0)
      ],
      # Unit price of each supply (€ HTVA), and a lump for small material.
      "supplies" => { "mulch_m2" => 3.45, "compost_l" => 0.13, "guard" => 3.38, "stake" => 0.79 },
      "small_material" => 100,
      # Plants per m² (area) or per metre (length), per category.
      "planting_types" => [
        type.("forest_garden", "area", { "shrub" => 0.25, "fruit_tree" => 0.005 }),
        type.("orchard", "area", { "fruit_tree" => 1 / 64.0 }),
        type.("herbaceous_zone", "area", { "herbaceous" => 6 }),
        type.("hedge_multirow", "length", { "hedge_evergreen" => 1 / 0.7, "hedge_fruit" => 1 }),
        type.("hedge_single", "length", { "shrub" => 1 }),
        type.("tree_row_double", "length", { "forest_tree" => 0.2 }),
        type.("no_planting", "area", {})
      ],
      "default_trips" => { "pre_design" => 3, "design" => 2, "implementation" => 4 },
      # Five criteria scored by the team, like the German HOAI's zones;
      # the total picks a level and its factor on the fees.
      "complexity" => {
        "criteria" => %w[slope_access water zones ecology people].map { { "key" => _1, "label" => nil, "max" => 6 } },
        "levels" => [
          { "key" => "simple", "label" => nil, "up_to" => 8, "factor" => 0.9 },
          { "key" => "standard", "label" => nil, "up_to" => 18, "factor" => 1.0 },
          { "key" => "complex", "label" => nil, "up_to" => 24, "factor" => 1.15 },
          { "key" => "very_complex", "label" => nil, "up_to" => 30, "factor" => 1.3 }
        ]
      },
      # Design (pre-design + design) as a share of the client's total, at most.
      "target_design_share_pct" => 30,
      # Terms the offer states, to keep the work within its price.
      # markup_label: how the client reads the contribution_pct markup on
      # the fees (Semisto's team writes its nonprofit contribution); none,
      # and the fees read as the designers' pay alone.
      "terms" => { "revisions" => 2, "validity_days" => 60, "deposit_pct" => 30, "markup_label" => nil, "exclusions" => nil, "assumptions" => nil }
    }.to_json).freeze

    # The planting type a drawn element starts with, by its kind.
    DEFAULT_TYPE_BY_KIND = {
      "patch" => "forest_garden", "zone" => "forest_garden", "land_cover" => "forest_garden",
      "hedge" => "hedge_multirow", "windbreak" => "hedge_multirow", "existing_hedge" => "hedge_multirow",
      "line" => "tree_row_double"
    }.freeze

    def self.semisto = @semisto ||= new(SEMISTO)

    attr_reader :data

    def initialize(data)
      @data = Normalizer.call(data)
    end

    def to_h = data
    def settings = data["settings"]
    def tasks = data["tasks"]
    def tasks_for(phase) = tasks.select { _1["phase"] == phase }
    def expenses_for(phase) = data["expenses"].select { _1["phase"] == phase }
    def categories = @categories ||= data["categories"].index_by { _1["key"] }
    def supplies = data["supplies"]
    def small_material = data["small_material"]
    def planting_types = @planting_types ||= data["planting_types"].index_by { _1["key"] }
    def default_trips = data["default_trips"]
    def complexity = data["complexity"]
    def target_design_share_pct = data["target_design_share_pct"]
    def terms = data["terms"]

    # The type a drawn feature starts with, when this pricing has it.
    def default_type_for(kind, measure_kind)
      key = DEFAULT_TYPE_BY_KIND[kind]
      key if key && planting_types.dig(key, "measure") == measure_kind
    end

    # The type an unknown or deleted key falls back to.
    def fallback_type(measure_kind = "area")
      planting_types.values.find { _1["measure"] == measure_kind && _1["mix"].any? }&.dig("key") || planting_types.keys.first
    end

    # The team's scores → { points, level, factor }. Nothing scored yet:
    # factor 1, so an offer the team has not scored is not moved.
    def complexity_for(scores)
      criteria = complexity["criteria"]
      scored = criteria.select { scores.key?(_1["key"]) }
      levels = complexity["levels"]
      return { "points" => nil, "max" => criteria.sum { _1["max"] }, "level" => nil, "factor" => 1.0 } if scored.empty? || levels.empty?
      points = scored.sum { scores[_1["key"]].to_f.clamp(0, _1["max"]) }
      level = levels.find { points <= _1["up_to"] } || levels.last
      { "points" => points, "max" => criteria.sum { _1["max"] }, "level" => level["key"], "factor" => level["factor"] }
    end

    # Turns any hash (a template being edited, an old version) into a
    # complete, typed pricing: unknown keys dropped, numbers clamped,
    # missing sections taken from Semisto's.
    module Normalizer
      module_function

      def call(raw)
        raw = Offer::Inputs.hash(raw)
        base = SEMISTO
        categories = list(raw.fetch("categories", base["categories"]), 30) { category(_1) }.uniq { _1["key"] }
        category_keys = categories.map { _1["key"] }
        {
          "settings" => Offer::Inputs.settings(raw["settings"], base["settings"]),
          "tasks" => list(raw.fetch("tasks", base["tasks"]), 120) { task(_1) }.uniq { [ _1["phase"], _1["key"] ] },
          "expenses" => list(raw.fetch("expenses", base["expenses"]), 60) { expense(_1) }.uniq { [ _1["phase"], _1["key"] ] },
          "categories" => categories,
          "supplies" => SUPPLY_KEYS.index_with { (number(Offer::Inputs.hash(raw["supplies"])[_1]) || base["supplies"][_1]).clamp(0, 10_000) },
          "small_material" => (number(raw["small_material"]) || base["small_material"]).clamp(0, 100_000),
          "planting_types" => planting_types(raw.fetch("planting_types", base["planting_types"]), category_keys),
          "default_trips" => PHASES.index_with { (number(Offer::Inputs.hash(raw["default_trips"])[_1]) || base["default_trips"][_1]).clamp(0, 100) },
          "complexity" => complexity(raw.fetch("complexity", base["complexity"])),
          "target_design_share_pct" => (number(raw["target_design_share_pct"]) || base["target_design_share_pct"]).clamp(0, 100),
          "terms" => terms(raw.fetch("terms", base["terms"]))
        }
      end

      def task(raw)
        key = raw["key"].to_s
        phase = raw["phase"].to_s
        return nil unless key.match?(KEY) && PHASES.include?(phase)
        persons = raw["persons"] == "designers" ? "designers" : (number(raw["persons"]) || 1).clamp(0, 20)
        {
          "key" => key, "phase" => phase, "label" => string(raw["label"]), "persons" => persons,
          "base" => (number(raw["base"]) || 0).clamp(0, 1_000), "per" => (number(raw["per"]) || 0).clamp(0, 1_000),
          "driver" => DRIVERS.include?(raw["driver"]) ? raw["driver"] : nil,
          "when" => CONDITIONS.include?(raw["when"]) ? raw["when"] : nil,
          "option" => Offer::Inputs.boolean(raw["option"]) || false,
          "gain_pct" => (number(raw["gain_pct"]) || 0).clamp(0, 90)
        }
      end

      def expense(raw)
        key = raw["key"].to_s
        phase = raw["phase"].to_s
        return nil unless key.match?(KEY) && PHASES.include?(phase)
        {
          "key" => key, "phase" => phase, "label" => string(raw["label"]),
          "amount" => (number(raw["amount"]) || 0).clamp(0, 1_000_000),
          "when" => CONDITIONS.include?(raw["when"]) ? raw["when"] : nil,
          "option" => Offer::Inputs.boolean(raw["option"]) || false
        }
      end

      def category(raw)
        key = raw["key"].to_s
        return nil unless key.match?(KEY)
        { "key" => key, "label" => string(raw["label"]), "price" => (number(raw["price"]) || 0).clamp(0, 100_000) }
          .merge(SUPPLY_KEYS.index_with { (number(raw[_1]) || 0).clamp(0, 100) })
      end

      def planting_types(raw, category_keys)
        types = list(raw, 30) do |type|
          key = type["key"].to_s
          next nil unless key.match?(KEY)
          mix = Offer::Inputs.hash(type["mix"]).slice(*category_keys).transform_values { number(_1)&.clamp(0, 100) }.compact
          { "key" => key, "label" => string(type["label"]), "measure" => MEASURES.include?(type["measure"]) ? type["measure"] : "area", "mix" => mix }
        end
        types = types.uniq { _1["key"] }
        types.any? ? types : [ { "key" => "no_planting", "label" => nil, "measure" => "area", "mix" => {} } ]
      end

      def complexity(raw)
        raw = Offer::Inputs.hash(raw)
        criteria = list(raw["criteria"], 8) do |criterion|
          key = criterion["key"].to_s
          key.match?(KEY) ? { "key" => key, "label" => string(criterion["label"]), "max" => (number(criterion["max"]) || 6).round.clamp(1, 20) } : nil
        end
        levels = list(raw["levels"], 6) do |level|
          key = level["key"].to_s
          next nil unless key.match?(KEY)
          { "key" => key, "label" => string(level["label"]), "up_to" => (number(level["up_to"]) || 0).clamp(0, 200), "factor" => (number(level["factor"]) || 1).clamp(0.3, 3) }
        end
        { "criteria" => criteria.uniq { _1["key"] }, "levels" => levels.uniq { _1["key"] }.sort_by { _1["up_to"] } }
      end

      def terms(raw)
        raw = Offer::Inputs.hash(raw)
        {
          "revisions" => number(raw["revisions"])&.round&.clamp(0, 20),
          "validity_days" => number(raw["validity_days"])&.round&.clamp(0, 365),
          "deposit_pct" => number(raw["deposit_pct"])&.clamp(0, 100),
          "markup_label" => string(raw["markup_label"], 120),
          "exclusions" => string(raw["exclusions"], 2_000),
          "assumptions" => string(raw["assumptions"], 2_000)
        }
      end

      def list(raw, max, &) = Offer::Inputs.list(raw, max, &)
      def number(value) = Offer::Inputs.number(value)
      def string(value, limit = 120) = Offer::Inputs.string(value, limit)
    end
  end
end
