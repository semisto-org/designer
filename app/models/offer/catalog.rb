class Offer
  # Semisto's way of pricing a forest garden, as a catalogue: the tasks of
  # each phase with the hours they take, the planting types that turn a
  # surface or a length into plants, and the plant categories with their
  # price and supplies. Calibrated on the Erpent offer (2026, two designers
  # for the pre-design, one for the design): the same measures give back
  # Christophe's spreadsheet to the euro for the first two phases.
  #
  # Hours of a task = base + per × driver, rounded to the half hour. Drivers
  # are read from the map and the offer (Offer::Measures):
  #   site_ha        area of the whole place, in hectares
  #   items          elements in the scope of the offer (base and options)
  #   plants         plants of the base scope
  #   option_plants  plants of the optional scope
  #   planting_days  days of collective planting (plants ÷ plants per day)
  # `persons` is a number, or "designers" for the tasks the whole design
  # team does together. `when` names the service (Offer::Inputs services)
  # or the condition that brings the task in; `option` tasks are supplements:
  # in the maximum, not in the minimum.
  #
  # Labels are in config/locales/offers.fr.yml (offers.tasks.<key>).
  module Catalog
    PHASES = %w[pre_design design implementation].freeze

    Task = Data.define(:key, :phase, :persons, :base, :per, :driver, :when, :option) do
      def initialize(key:, phase:, persons: 1, base: 0, per: 0, driver: nil, when: nil, option: false)
        super
      end
    end

    Expense = Data.define(:key, :phase, :amount, :when, :option) do
      def initialize(key:, phase:, amount:, when: nil, option: false)
        super
      end
    end

    TASKS = [
      # Pré-design: dream the project together, read the land, a plan of zones.
      Task.new(key: "offer", phase: "pre_design", persons: "designers", base: 3),
      Task.new(key: "interview", phase: "pre_design", persons: "designers", base: 2.5),
      Task.new(key: "site_analysis", phase: "pre_design", persons: "designers", base: 2, per: 0.33, driver: "site_ha"),
      Task.new(key: "research", phase: "pre_design", persons: "designers", base: 2),
      Task.new(key: "functional_analysis", phase: "pre_design", persons: "designers", base: 1.5),
      Task.new(key: "elements_flows", phase: "pre_design", persons: "designers", base: 1),
      Task.new(key: "team_sync", phase: "pre_design", persons: "designers", base: 1, when: "two_designers"),
      Task.new(key: "zone_plan", phase: "pre_design", base: 2, per: 0.25, driver: "items"),
      Task.new(key: "photo_sketches", phase: "pre_design", base: 5),
      Task.new(key: "peer_review", phase: "pre_design", persons: "designers", base: 1),
      Task.new(key: "presentation_prep", phase: "pre_design", base: 1),
      Task.new(key: "presentation", phase: "pre_design", persons: "designers", base: 2),
      Task.new(key: "co_author_coaching", phase: "pre_design", base: 3, when: "co_author"),
      Task.new(key: "validation_document", phase: "pre_design", persons: "designers", base: 1.5),
      Task.new(key: "project_management", phase: "pre_design", base: 5),
      # Design: the plant palette and the planting plan, ready to plant.
      Task.new(key: "existing_trees_survey", phase: "design", base: 5, when: "existing_trees"),
      Task.new(key: "sun_study", phase: "design", base: 5, when: "sun_study"),
      Task.new(key: "plant_palette", phase: "design", base: 3),
      Task.new(key: "expert_opinion", phase: "design", base: 2, when: "expert_opinion"),
      Task.new(key: "planting_plan", phase: "design", base: 2, per: 0.02, driver: "plants"),
      Task.new(key: "option_planting_plan", phase: "design", per: 0.02, driver: "option_plants", when: "option_scope", option: true),
      Task.new(key: "wildlife", phase: "design", base: 2, when: "wildlife", option: true),
      Task.new(key: "pond_design", phase: "design", base: 4, when: "pond", option: true),
      Task.new(key: "mushrooms_design", phase: "design", base: 1, when: "mushrooms", option: true),
      Task.new(key: "harvest_table", phase: "design", base: 3, when: "harvest_table"),
      Task.new(key: "co_author_coaching", phase: "design", base: 3, when: "co_author"),
      Task.new(key: "peer_review", phase: "design", base: 1),
      Task.new(key: "presentation", phase: "design", base: 2),
      Task.new(key: "project_management", phase: "design", base: 3),
      # Mise en œuvre: collective plantings with the people of the place.
      Task.new(key: "planting_days", phase: "implementation", base: 8, per: 6, driver: "planting_days"),
      Task.new(key: "staking", phase: "implementation", persons: 2, base: 1, per: 0.004, driver: "plants"),
      Task.new(key: "mushrooms_workshop", phase: "implementation", persons: 2, base: 4, when: "mushrooms", option: true),
      Task.new(key: "pond_works", phase: "implementation", base: 24, when: "pond", option: true)
    ].freeze

    EXPENSES = [
      Expense.new(key: "soil_analysis", phase: "pre_design", amount: 150, when: "soil_analysis"),
      Expense.new(key: "printing", phase: "design", amount: 50),
      Expense.new(key: "pond_supplies", phase: "implementation", amount: 2_500, when: "pond", option: true),
      Expense.new(key: "mushrooms_supplies", phase: "implementation", amount: 150, when: "mushrooms", option: true)
    ].freeze

    # Services the team switches on in the internal sheet. Some are
    # suggested by the map or the project sheet (Offer::Measures#suggestions).
    SERVICES = %w[co_author soil_analysis existing_trees sun_study expert_opinion wildlife pond mushrooms harvest_table].freeze

    # Round trips per phase, before the team says otherwise.
    DEFAULT_TRIPS = { "pre_design" => 3, "design" => 2, "implementation" => 4 }.freeze

    # Plant categories: price per plant (€ HTVA) and supplies per plant.
    CATEGORIES = {
      "fruit_tree" => { price: 25, mulch_m2: 1, compost_l: 3, guard: 1, stake: 1 },
      "shrub" => { price: 10, mulch_m2: 1, compost_l: 3, guard: 1, stake: 1 },
      "forest_tree" => { price: 5.33, mulch_m2: 1, compost_l: 3, guard: 1, stake: 1 },
      "hedge_evergreen" => { price: 6, mulch_m2: 0.8, compost_l: 0.75, guard: 0, stake: 0 },
      "hedge_fruit" => { price: 12, mulch_m2: 0.8, compost_l: 0.75, guard: 0, stake: 0 },
      "herbaceous" => { price: 6, mulch_m2: 0.2, compost_l: 1, guard: 0, stake: 0 }
    }.freeze

    # Unit price of each supply (€ HTVA), and a fixed lump for small material.
    SUPPLIES = { "mulch_m2" => 3.45, "compost_l" => 0.13, "guard" => 3.38, "stake" => 0.79 }.freeze
    SMALL_MATERIAL = 100

    # Planting types: what a surface (plants per m²) or a length (plants
    # per metre) of the scope becomes, per plant category.
    PLANTING_TYPES = {
      "forest_garden" => { measure: "area", mix: { "shrub" => 0.25, "fruit_tree" => 0.005 } },
      "orchard" => { measure: "area", mix: { "fruit_tree" => 1 / 64.0 } },
      "herbaceous_zone" => { measure: "area", mix: { "herbaceous" => 6 } },
      "hedge_multirow" => { measure: "length", mix: { "hedge_evergreen" => 1 / 0.7, "hedge_fruit" => 1 } },
      "hedge_single" => { measure: "length", mix: { "shrub" => 1 } },
      "tree_row_double" => { measure: "length", mix: { "forest_tree" => 0.2 } },
      "no_planting" => { measure: "area", mix: {} }
    }.freeze

    # The planting type a drawn element starts with, by its kind.
    DEFAULT_TYPE_BY_KIND = {
      "patch" => "forest_garden", "zone" => "forest_garden", "land_cover" => "forest_garden",
      "hedge" => "hedge_multirow", "windbreak" => "hedge_multirow", "existing_hedge" => "hedge_multirow",
      "line" => "tree_row_double"
    }.freeze

    def self.tasks_for(phase) = TASKS.select { _1.phase == phase }
    def self.expenses_for(phase) = EXPENSES.select { _1.phase == phase }
  end
end
