class Offer
  # Turns the measures of the map and the team's inputs into the budget of
  # the offer, phase by phase:
  #
  #   lines     catalogue tasks (persons × hours × rate, hours from the map),
  #             expenses, trips, and the team's own lines
  #   fees      labour × (1 + contribution) × (1 + adjustments); the maximum
  #             adds the optional lines and the buffer
  #   expenses  soil analysis, printing, trips…, at cost
  #   prices    what the client sees, TVAC, rounded, or set by the team
  #
  # then the plants and supplies of the scope and the co-management
  # estimate. Every computed number keeps the formula it came from, so the
  # team sees why a line weighs what it weighs.
  class Estimator
    attr_reader :inputs, :measures

    def initialize(inputs, measures)
      @inputs = inputs
      @measures = measures
    end

    def call
      phases = Catalog::PHASES.map { phase(_1) }
      plants = plants_and_supplies
      co_management = co_management_estimate
      totals = totals(phases, plants)
      {
        "phases" => phases, "plants" => plants, "co_management" => co_management,
        "totals" => totals, "regie_rate_tvac" => (rate * (1 + vat(:services))).round(2),
        "warnings" => warnings(phases, totals)
      }
    end

    private
      def settings = inputs["settings"]
      def rate = settings["hourly_rate"]
      def vat(kind) = settings["vat_#{kind}_pct"] / 100.0
      def drivers = @drivers ||= measures.drivers

      def phase(key)
        lines = task_lines(key) + custom_lines(key, "hours")
        expenses = expense_lines(key) + trip_lines(key) + custom_lines(key, "amount")
        counted = lines.reject { _1["disabled"] }
        spent = expenses.reject { _1["disabled"] }
        labour_base = counted.reject { _1["option"] }.sum { _1["amount"] }
        labour_options = counted.select { _1["option"] }.sum { _1["amount"] }
        adjustment_pct = inputs["adjustments"].select { [ "all", key ].include?(_1["phase"]) }.sum { _1["pct"] }
        factor = (1 + settings["contribution_pct"] / 100.0) * (1 + adjustment_pct / 100.0)
        fees_min = labour_base * factor
        fees_max = (labour_base + labour_options) * factor * (1 + settings["buffer_pct"] / 100.0)
        expenses_min = spent.reject { _1["option"] }.sum { _1["amount"] }
        expenses_max = spent.sum { _1["amount"] }
        computed = { "fees" => round_price(fees_min * (1 + vat(:services))), "expenses" => round_price(expenses_min * (1 + vat(:services))) }
        set = inputs.dig("prices", key) || {}
        prices = computed.to_h { |part, value| [ part, set[part] || value ] }
        {
          "key" => key, "lines" => lines, "expenses" => expenses,
          "hours_min" => counted.reject { _1["option"] }.sum { _1["persons"] * _1["hours"] }.round(1),
          "hours_max" => counted.sum { _1["persons"] * _1["hours"] }.round(1),
          "labour_base" => labour_base.round(2), "labour_options" => labour_options.round(2),
          "adjustment_pct" => adjustment_pct, "factor" => factor.round(4),
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
        Catalog.tasks_for(phase).filter_map do |task|
          next unless applies?(task.when)
          persons = task.persons == "designers" ? settings["designers"] : task.persons
          value = task.driver ? drivers[task.driver].to_f : nil
          hours = half_hour(task.base + task.per * value.to_f)
          line("#{phase}.#{task.key}", task: task.key, persons:, hours:, option: task.option,
               formula: { "base" => task.base, "per" => task.per, "driver" => task.driver, "value" => value })
        end
      end

      def expense_lines(phase)
        Catalog.expenses_for(phase).filter_map do |expense|
          next unless applies?(expense.when)
          key = "#{phase}.#{expense.key}"
          override = overrides[key] || {}
          amount = override["amount"] || expense.amount
          { "key" => key, "kind" => "expense", "task" => expense.key, "amount" => amount.to_f, "computed_amount" => expense.amount.to_f,
            "option" => expense.option, "disabled" => override["disabled"] || false, "overridden" => !override["amount"].nil? }
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

      def line(key, task:, persons:, hours:, option:, formula:)
        override = overrides[key] || {}
        final_persons = override["persons"] || persons
        final_hours = override["hours"] || hours
        {
          "key" => key, "kind" => "task", "task" => task,
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
        categories = Catalog::CATEGORIES.filter_map do |key, spec|
          next unless quantities.key?(key)
          price = inputs["plant_prices"][key] || spec[:price]
          q = quantities[key]
          { "key" => key, "price" => price, "base" => q["base"], "option" => q["option"],
            "amount_base" => (q["base"] * price).round(2), "amount_option" => (q["option"] * price).round(2) }
        end
        supplies = Catalog::SUPPLIES.map do |key, unit_price|
          base = quantities.sum { |category, q| q["base"] * Catalog::CATEGORIES.dig(category, key.to_sym).to_f }
          option = quantities.sum { |category, q| q["option"] * Catalog::CATEGORIES.dig(category, key.to_sym).to_f }
          { "key" => key, "unit_price" => unit_price, "base" => base.round(1), "option" => option.round(1),
            "amount_base" => (base * unit_price).round(2), "amount_option" => (option * unit_price).round(2) }
        end
        small = quantities.any? ? Catalog::SMALL_MATERIAL : 0
        margin = 1 + settings["plants_margin_pct"] / 100.0
        plants_base = categories.sum { _1["amount_base"] } * margin
        plants_max = plants_base + categories.sum { _1["amount_option"] } * margin
        supplies_base = (supplies.sum { _1["amount_base"] } + small) * margin
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

      def co_management_estimate
        hours = settings["co_management_half_days"] * settings["half_day_hours"]
        { "half_days" => settings["co_management_half_days"], "hours" => hours,
          "amount_htva" => (hours * rate).round(2), "amount_tvac" => (hours * rate * (1 + vat(:services))).round(2) }
      end

      def totals(phases, plants)
        services_tvac = phases.sum { _1["price_tvac"] }
        {
          "services_min" => phases.sum { _1["total_min"] }.round(2), "services_max" => phases.sum { _1["total_max"] }.round(2),
          "services_price_tvac" => services_tvac,
          "services_max_tvac" => phases.sum { _1["total_max_tvac"] }.round(2),
          "plants_supplies_base_tvac" => (plants["plants_base_tvac"] + plants["supplies_base_tvac"]).round(2),
          "plants_supplies_max_tvac" => (plants["plants_max_tvac"] + plants["supplies_max_tvac"]).round(2),
          "total_tvac" => (services_tvac + plants["plants_base_tvac"] + plants["supplies_base_tvac"]).round(2),
          "total_max_tvac" => (phases.sum { _1["total_max_tvac"] } + plants["plants_max_tvac"] + plants["supplies_max_tvac"]).round(2)
        }
      end

      def warnings(phases, totals)
        list = []
        list << { "code" => "no_scope" } if measures.scope.empty?
        measures.scope.select { _1["missing"] }.each { list << { "code" => "missing_feature", "label" => _1["label"] } }
        phases.each do |phase|
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
        list
      end

      def half_hour(hours) = (hours * 2).round / 2.0

      def round_price(value)
        step = settings["rounding"].to_f
        ((value / step).round * step).round(2)
      end
  end
end
