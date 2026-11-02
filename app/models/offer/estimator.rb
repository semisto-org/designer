class Offer
  # Turns the measures of the map and the team's inputs into the budget of
  # the offer, phase by phase:
  #
  #   lines     the pricing's tasks (persons × hours × rate, hours from the
  #             map), the team's own lines, then project management as a
  #             share of those hours; expenses and trips
  #   fees      labour × (1 + contribution) × complexity × (1 + adjustments);
  #             the maximum adds the optional lines and the buffer
  #   expenses  soil analysis, printing, trips…, at cost
  #   prices    what the client sees, TVAC, rounded, or set by the team
  #
  # then the plants and supplies of the scope, co-management year by year
  # when the team offers it, and how the client's money splits between
  # design and planting. A phase the team leaves out of the offer is still
  # computed (to switch it back on) but counts nowhere. Every computed number keeps the formula it came from, so the
  # team sees why a line weighs what it weighs.
  class Estimator
    DESIGN_PHASES = %w[pre_design design].freeze

    attr_reader :inputs, :measures, :pricing

    def initialize(inputs, measures, pricing = Pricing.semisto)
      @inputs = inputs
      @measures = measures
      @pricing = pricing
    end

    def call
      phases = Pricing::PHASES.map { phase(_1) }
      plants = plants_and_supplies
      co_management = co_management_estimate
      totals = totals(phases, plants, co_management)
      warnings = warnings(phases, totals)
      {
        "phases" => phases, "plants" => plants, "co_management" => co_management,
        "complexity" => complexity, "totals" => totals,
        "regie_rate_tvac" => (rate * (1 + vat(:services))).round(2),
        "target_design_share_pct" => pricing.target_design_share_pct,
        "warnings" => warnings,
        "precision" => Precision.new(measures, inputs, pricing, warnings).call
      }
    end

    private
      def settings = inputs["settings"]
      def rate = settings["hourly_rate"]
      def vat(kind) = settings["vat_#{kind}_pct"] / 100.0
      def drivers = @drivers ||= measures.drivers
      def complexity = @complexity ||= pricing.complexity_for(inputs["complexity"] || {})

      def phase(key)
        lines = task_lines(key) + custom_lines(key, "hours")
        lines << project_management_line(key, lines) if DESIGN_PHASES.include?(key)
        expenses = expense_lines(key) + trip_lines(key) + custom_lines(key, "amount")
        counted = lines.reject { _1["disabled"] }
        spent = expenses.reject { _1["disabled"] }
        labour_base = counted.reject { _1["option"] }.sum { _1["amount"] }
        labour_options = counted.select { _1["option"] }.sum { _1["amount"] }
        adjustment_pct = inputs["adjustments"].select { [ "all", key ].include?(_1["phase"]) }.sum { _1["pct"] }
        factor = (1 + settings["contribution_pct"] / 100.0) * complexity["factor"] * (1 + adjustment_pct / 100.0)
        fees_min = labour_base * factor
        fees_max = (labour_base + labour_options) * factor * (1 + settings["buffer_pct"] / 100.0)
        expenses_min = spent.reject { _1["option"] }.sum { _1["amount"] }
        expenses_max = spent.sum { _1["amount"] }
        computed = { "fees" => round_price(fees_min * (1 + vat(:services))), "expenses" => round_price(expenses_min * (1 + vat(:services))) }
        set = inputs.dig("prices", key) || {}
        prices = computed.to_h { |part, value| [ part, set[part] || value ] }
        {
          "key" => key, "enabled" => !inputs["phases_off"].include?(key), "lines" => lines, "expenses" => expenses,
          "hours_min" => counted.reject { _1["option"] }.sum { _1["persons"] * _1["hours"] }.round(1),
          "hours_max" => counted.sum { _1["persons"] * _1["hours"] }.round(1),
          "labour_base" => labour_base.round(2), "labour_options" => labour_options.round(2),
          "adjustment_pct" => adjustment_pct, "factor" => factor.round(4),
          # The steps of the fees, so the team reads where a price comes from.
          "contribution_pct" => settings["contribution_pct"], "complexity_factor" => complexity["factor"],
          "fees_min_tvac" => (fees_min * (1 + vat(:services))).round(2), "rounding" => settings["rounding"],
          "fees_min" => fees_min.round(2), "fees_max" => fees_max.round(2),
          "expenses_min" => expenses_min.round(2), "expenses_max" => expenses_max.round(2),
          "total_min" => (fees_min + expenses_min).round(2), "total_max" => (fees_max + expenses_max).round(2),
          "total_min_tvac" => ((fees_min + expenses_min) * (1 + vat(:services))).round(2),
          "total_max_tvac" => ((fees_max + expenses_max) * (1 + vat(:services))).round(2),
          "computed_prices" => computed, "prices" => prices,
          "prices_set" => set.keys, "price_tvac" => prices.values.sum
        }
      end

      def task_lines(phase)
        pricing.tasks_for(phase).filter_map do |task|
          next unless applies?(task["when"])
          persons = task["persons"] == "designers" ? settings["designers"] : task["persons"]
          value = task["driver"] ? drivers[task["driver"]].to_f : nil
          hours = half_hour(task["base"] + task["per"] * value.to_f)
          line("#{phase}.#{task['key']}", task: task["key"], label: task["label"], persons:, hours:, option: task["option"],
               formula: { "base" => task["base"], "per" => task["per"], "driver" => task["driver"], "value" => value })
        end
      end

      def expense_lines(phase)
        pricing.expenses_for(phase).filter_map do |expense|
          next unless applies?(expense["when"])
          key = "#{phase}.#{expense['key']}"
          override = overrides[key] || {}
          amount = override["amount"] || expense["amount"]
          { "key" => key, "kind" => "expense", "task" => expense["key"], "label" => expense["label"],
            "amount" => amount.to_f, "computed_amount" => expense["amount"].to_f,
            "option" => expense["option"], "disabled" => override["disabled"] || false, "overridden" => !override["amount"].nil? }
        end
      end

      def trip_lines(phase)
        inputs["trips"].select { _1["phase"] == phase }.map do |trip|
          km = trip["trips"].to_f * trip["one_way_km"].to_f * 2
          { "key" => "trip.#{trip['id']}", "kind" => "trip", "id" => trip["id"], "label" => trip["label"],
            "trips" => trip["trips"], "one_way_km" => trip["one_way_km"], "km" => km.round(1),
            "amount" => (km * settings["km_rate"]).round(2), "option" => false, "disabled" => false }
        end
      end

      def custom_lines(phase, kind)
        inputs["custom_lines"].select { _1["phase"] == phase && _1["kind"] == kind }.map do |custom|
          if kind == "hours"
            persons = custom["persons"] || 1
            hours = custom["hours"].to_f
            { "key" => "custom.#{custom['id']}", "kind" => "custom", "id" => custom["id"], "label" => custom["label"],
              "persons" => persons, "hours" => hours, "amount" => (persons * hours * rate).round(2),
              "option" => custom["option"], "disabled" => false }
          else
            { "key" => "custom.#{custom['id']}", "kind" => "custom", "id" => custom["id"], "label" => custom["label"],
              "amount" => custom["amount"].to_f, "option" => custom["option"], "disabled" => false }
          end
        end
      end

      # Project management: a share of the phase's working hours (base scope,
      # lines kept), to the hour, down for a designer alone, up when several
      # people work on the phase. The team corrects it like any line.
      def project_management_line(phase, lines)
        counted = lines.reject { _1["disabled"] || _1["option"] }
        worked = counted.sum { _1["persons"] * _1["hours"] }
        pct = settings["project_management_pct"]
        exact = worked * pct / 100.0
        hours = counted.any? { _1["persons"] >= 2 } ? exact.ceil : exact.floor
        line("#{phase}.#{Pricing::PROJECT_MANAGEMENT}", task: Pricing::PROJECT_MANAGEMENT, label: nil, persons: 1, hours: hours.to_f,
             option: false, formula: { "pct" => pct, "of_hours" => worked.round(1) }, kind: "project_management")
      end

      def line(key, task:, label:, persons:, hours:, option:, formula:, kind: "task")
        override = overrides[key] || {}
        final_persons = override["persons"] || persons
        final_hours = override["hours"] || hours
        {
          "key" => key, "kind" => kind, "task" => task, "label" => label,
          "persons" => final_persons, "hours" => final_hours, "rate" => rate,
          "amount" => (final_persons * final_hours * rate).round(2),
          "computed_persons" => persons, "computed_hours" => hours,
          "overridden" => !override["persons"].nil? || !override["hours"].nil?,
          "option" => option, "disabled" => override["disabled"] || false, "formula" => formula
        }
      end

      def applies?(condition)
        case condition
        when nil then true
        when "two_designers" then settings["designers"] >= 2
        when "option_scope" then drivers["option_plants"].to_i.positive?
        else measures.service?(condition)
        end
      end

      def overrides = @overrides ||= inputs["lines"].index_by { _1["key"] }

      def plants_and_supplies
        quantities = Hash.new { |h, k| h[k] = { "base" => 0, "option" => 0 } }
        measures.scope.each do |item|
          item["plants"].each { |category, count| quantities[category][item["option"] ? "option" : "base"] += count }
        end
        categories = pricing.categories.filter_map do |key, spec|
          next unless quantities.key?(key)
          price = inputs["plant_prices"][key] || spec["price"]
          q = quantities[key]
          { "key" => key, "label" => spec["label"], "price" => price, "base" => q["base"], "option" => q["option"],
            "amount_base" => (q["base"] * price).round(2), "amount_option" => (q["option"] * price).round(2) }
        end
        corrections = inputs["supplies"].index_by { _1["key"] }
        supplies = pricing.supplies.map do |key, unit_price|
          base = quantities.sum { |category, q| q["base"] * pricing.categories.dig(category, key).to_f }
          option = quantities.sum { |category, q| q["option"] * pricing.categories.dig(category, key).to_f }
          supply_row(key, base, option, unit_price, corrections[key])
        end
        # Small material: a lump, as one piece at its price.
        supplies << supply_row("small_material", quantities.any? ? 1 : 0, 0, pricing.small_material, corrections["small_material"])
        supplies += inputs["custom_supplies"].map do |custom|
          quantity = custom["quantity"].to_f
          price = custom["unit_price"].to_f
          { "key" => "custom.#{custom['id']}", "kind" => "custom", "id" => custom["id"], "label" => custom["label"],
            "unit_price" => price, "base" => quantity, "option" => 0, "amount_base" => (quantity * price).round(2), "amount_option" => 0,
            "disabled" => false, "overridden" => false }
        end
        small = supplies.find { _1["key"] == "small_material" }["amount_base"]
        margin = 1 + settings["plants_margin_pct"] / 100.0
        plants_base = categories.sum { _1["amount_base"] } * margin
        plants_max = plants_base + categories.sum { _1["amount_option"] } * margin
        supplies_base = supplies.sum { _1["amount_base"] } * margin
        supplies_max = supplies_base + supplies.sum { _1["amount_option"] } * margin
        {
          "categories" => categories, "supplies" => supplies, "small_material" => small,
          "count_base" => categories.sum { _1["base"] }, "count_option" => categories.sum { _1["option"] },
          "plants_base" => plants_base.round(2), "plants_max" => plants_max.round(2),
          "supplies_base" => supplies_base.round(2), "supplies_max" => supplies_max.round(2),
          "plants_base_tvac" => (plants_base * (1 + vat(:plants))).round(2),
          "plants_max_tvac" => (plants_max * (1 + vat(:plants))).round(2),
          "supplies_base_tvac" => (supplies_base * (1 + vat(:supplies))).round(2),
          "supplies_max_tvac" => (supplies_max * (1 + vat(:supplies))).round(2)
        }
      end

      # A computed supply with the team's correction: left out, another
      # quantity of the base scope, another unit price.
      def supply_row(key, base, option, unit_price, correction)
        correction ||= {}
        quantity = correction["quantity"] || base
        price = correction["unit_price"] || unit_price
        off = correction["disabled"] || false
        { "key" => key, "kind" => "supply", "unit_price" => price, "computed_unit_price" => unit_price,
          "base" => quantity.round(1), "computed_base" => base.round(1), "option" => option.round(1),
          "amount_base" => off ? 0 : (quantity * price).round(2), "amount_option" => off ? 0 : (option * price).round(2),
          "disabled" => off, "overridden" => !correction["quantity"].nil? || !correction["unit_price"].nil? }
      end

      # Co-management after planting, year by year: the half-days at the
      # hourly rate, and a round trip to the place for each of them.
      def co_management_estimate
        spec = inputs["co_management"]
        years = spec["years"].presence || [ settings["co_management_half_days"] ]
        km = spec["one_way_km"] || inputs["trips"].find { _1["one_way_km"] }&.dig("one_way_km")
        rows = years.each_with_index.map do |half_days, index|
          hours = half_days * settings["half_day_hours"]
          trips = (half_days * km.to_f * 2 * settings["km_rate"]).round(2)
          htva = (hours * rate + trips).round(2)
          { "year" => index + 1, "half_days" => half_days, "hours" => hours, "trips_htva" => trips,
            "amount_htva" => htva, "amount_tvac" => (htva * (1 + vat(:services))).round(2) }
        end
        {
          "enabled" => spec["enabled"], "years" => rows, "one_way_km" => km,
          "half_days" => rows.sum { _1["half_days"] }, "hours" => rows.sum { _1["hours"] },
          "amount_htva" => rows.sum { _1["amount_htva"] }.round(2), "amount_tvac" => rows.sum { _1["amount_tvac"] }.round(2)
        }
      end

      # Only the phases in the offer count; plants and supplies come with
      # the implementation, co-management when the team offers it.
      def totals(phases, all_plants, co_management)
        phases = phases.select { _1["enabled"] }
        planting = phases.any? { _1["key"] == "implementation" }
        plants = planting ? all_plants : all_plants.transform_values { _1.is_a?(Numeric) ? 0 : _1 }
        co_management_tvac = co_management["enabled"] ? co_management["amount_tvac"] : 0
        services_tvac = phases.sum { _1["price_tvac"] }
        total = services_tvac + plants["plants_base_tvac"] + plants["supplies_base_tvac"] + co_management_tvac
        design = phases.select { DESIGN_PHASES.include?(_1["key"]) }.sum { _1["price_tvac"] }
        {
          "design_tvac" => design.round(2), "implementation_tvac" => (total - design).round(2),
          "design_share_pct" => total.positive? ? (design * 100.0 / total).round(1) : nil,
          "co_management_tvac" => co_management_tvac, "planting_included" => planting,
          "services_min" => phases.sum { _1["total_min"] }.round(2), "services_max" => phases.sum { _1["total_max"] }.round(2),
          "services_price_tvac" => services_tvac,
          "services_max_tvac" => phases.sum { _1["total_max_tvac"] }.round(2),
          "plants_supplies_base_tvac" => (plants["plants_base_tvac"] + plants["supplies_base_tvac"]).round(2),
          "plants_supplies_max_tvac" => (plants["plants_max_tvac"] + plants["supplies_max_tvac"]).round(2),
          "total_tvac" => total.round(2),
          "total_max_tvac" => (phases.sum { _1["total_max_tvac"] } + plants["plants_max_tvac"] + plants["supplies_max_tvac"] + co_management_tvac).round(2)
        }
      end

      def warnings(phases, totals)
        list = []
        list << { "code" => "no_scope" } if measures.scope.empty?
        measures.scope.select { _1["missing"] }.each { list << { "code" => "missing_feature", "label" => _1["label"] } }
        phases.select { _1["enabled"] }.each do |phase|
          phase["expenses"].select { _1["kind"] == "trip" && _1["trips"].to_f.positive? && _1["one_way_km"].nil? }
            .each { list << { "code" => "trip_without_km", "phase" => phase["key"] } }
          phase["prices_set"].each do |part|
            computed = phase["computed_prices"][part]
            next unless computed.positive? && phase["prices"][part] < computed * 0.9
            list << { "code" => "price_below_computed", "phase" => phase["key"], "part" => part }
          end
        end
        ceiling = measures.budget_ceiling
        list << { "code" => "over_budget", "ceiling" => ceiling } if ceiling && totals["total_tvac"] > ceiling
        target = pricing.target_design_share_pct
        share = totals["design_share_pct"]
        list << { "code" => "design_share", "share" => share, "target" => target } if share && target.positive? && share > target
        list
      end

      def half_hour(hours) = (hours * 2).round / 2.0

      def round_price(value)
        step = settings["rounding"].to_f
        ((value / step).round * step).round(2)
      end
  end
end
