class FinancialPlan
  # Pure 20-year projection of a plan's inputs: yearly profit and loss,
  # cash flow, harvest and picking hours, break-even and payback years.
  # No database, no I/O. Constant euros (no inflation), excluding VAT,
  # before income taxes. Floats are fine for an estimate; values are
  # rounded only on output.
  #
  # Per species and plan year y (plant age a = y - planting_year + 1):
  #   yield share   0 before first_harvest_age, then a linear ramp up to 1
  #                 at full_production_age
  #   harvest kg    quantity x yield_kg_per_plant x yield share
  #   marketable    harvest x (1 - loss_pct)
  #   sales         sum over channels of marketable x share x price per kg
  #   picking hours harvest / picking_rate_kg_per_hour
  #
  # Profit and loss: revenue (sales, other revenue, subsidies, carbon)
  # - operating costs (fixed, variable, picking labour) = EBITDA,
  # - depreciation (straight line) - loan interest = result.
  # Cash flow: EBITDA - interest - investments + loans received - principal
  # repaid, accumulated from the opening cash.
  class Calculator
    YEARS = Schema::HORIZON_YEARS
    CHANNELS = Schema::CHANNELS

    Year = Data.define(
      :year, :calendar_year, :harvest_kg, :sold_kg, :picking_hours,
      :sales, :other_revenue, :subsidies, :carbon, :revenue,
      :fixed_costs, :variable_costs, :labour_cost, :operating_costs, :ebitda,
      :depreciation, :interest, :result,
      :investments, :loan_received, :loan_repaid, :net_cash_flow, :cumulative_cash
    )
    SpeciesYears = Data.define(:id, :name, :harvest_kg, :sales, :picking_hours)
    Result = Data.define(:years, :species, :indicators, :warnings) do
      def as_json(*)
        {
          "years" => years.map { |year| Calculator.round_row(year.to_h) },
          "species" => species.map do |line|
            { "id" => line.id, "name" => line.name, "harvestKg" => line.harvest_kg.map { _1.round(1) },
              "sales" => line.sales.map { _1.round(2) }, "pickingHours" => line.picking_hours.map { _1.round(1) } }
          end,
          "indicators" => indicators.transform_keys { _1.to_s.camelize(:lower) }.transform_values { _1.is_a?(Float) ? _1.round(2) : _1 },
          "warnings" => warnings
        }
      end
    end

    def self.round_row(row)
      row.to_h do |key, value|
        precision = %i[harvest_kg sold_kg picking_hours].include?(key) ? 1 : 2
        [ key.to_s.camelize(:lower), value.is_a?(Float) ? value.round(precision) : value ]
      end
    end

    def initialize(inputs, area_ha: nil)
      @inputs = Inputs.from(inputs)
      @settings = @inputs.settings
      @area_ha = @settings.area_ha || area_ha
    end

    def call
      species = productive_species.map { species_years(_1) }
      investments = investment_schedule
      depreciation = depreciation_schedule
      loans = loan_schedule
      cumulative = @settings.opening_cash.to_f

      years = (1..YEARS).map do |year|
        i = year - 1
        harvest = species.sum { _1.harvest_kg[i] }
        sold = productive_species.each_with_index.sum { |line, index| sold_kg(line, species[index].harvest_kg[i]) }
        hours = species.sum { _1.picking_hours[i] }
        sales = species.sum { _1.sales[i] }
        other = sum_active(@inputs.other_revenues, year)
        subsidies = sum_active(@inputs.subsidies, year)
        carbon = carbon_revenue(year)
        revenue = sales + other + subsidies + carbon

        fixed = sum_active(@inputs.fixed_costs, year)
        variable = variable_costs(year, sold_kg: sold, sales:)
        labour = hours * @settings.labour_cost_per_hour.to_f
        operating = fixed + variable + labour
        ebitda = revenue - operating

        interest = loans[:interest][i]
        result = ebitda - depreciation[i] - interest
        net = ebitda - interest - investments[:total][i] + loans[:received][i] - loans[:principal][i]
        cumulative += net

        Year.new(
          year:, calendar_year: @settings.start_year + i, harvest_kg: harvest, sold_kg: sold, picking_hours: hours,
          sales:, other_revenue: other, subsidies:, carbon:, revenue:,
          fixed_costs: fixed, variable_costs: variable, labour_cost: labour, operating_costs: operating, ebitda:,
          depreciation: depreciation[i], interest:, result:,
          investments: investments[:total][i], loan_received: loans[:received][i], loan_repaid: loans[:principal][i],
          net_cash_flow: net, cumulative_cash: cumulative
        )
      end

      Result.new(years:, species:, indicators: indicators(years, investments, loans), warnings:)
    end

    # Share of the mature yield at a given plant age (1 = planting year).
    def self.yield_share(age, first_harvest_age, full_production_age)
      return 0.0 if first_harvest_age.nil? || age < first_harvest_age
      full = [ full_production_age || first_harvest_age, first_harvest_age ].max
      return 1.0 if age >= full
      (age - first_harvest_age + 1).fdiv(full - first_harvest_age + 1)
    end

    private
      def lines_with_plants = @inputs.species.select { _1.quantity.to_i.positive? }

      # Lines that can produce: plants, a yield and a first harvest age.
      def productive_species
        @productive_species ||= lines_with_plants.select { _1.yield_kg_per_plant.to_f.positive? && _1.first_harvest_age }
      end

      def species_years(line)
        harvest = Array.new(YEARS, 0.0)
        sales = Array.new(YEARS, 0.0)
        hours = Array.new(YEARS, 0.0)
        (line.planting_year..YEARS).each do |year|
          age = year - line.planting_year + 1
          kg = line.quantity * line.yield_kg_per_plant * self.class.yield_share(age, line.first_harvest_age, line.full_production_age)
          harvest[year - 1] = kg
          sales[year - 1] = sales_of(line, kg)
          rate = line.picking_rate_kg_per_hour.to_f
          hours[year - 1] = rate.positive? ? kg / rate : 0.0
        end
        SpeciesYears.new(id: line.id, name: line.name || line.latin_name, harvest_kg: harvest, sales:, picking_hours: hours)
      end

      def marketable(line, harvest_kg) = harvest_kg * (1 - line.loss_pct.to_f / 100)

      # Channel shares above 100 % in total are scaled down to 100 %.
      def share_scale(line)
        total = line.shares.values.sum(&:to_f)
        total > 100 ? 100 / total : 1.0
      end

      def sold_kg(line, harvest_kg)
        total = line.shares.values.sum(&:to_f)
        marketable(line, harvest_kg) * [ total, 100 ].min / 100
      end

      def sales_of(line, harvest_kg)
        kg = marketable(line, harvest_kg)
        scale = share_scale(line)
        CHANNELS.sum { |channel| kg * line.shares[channel].to_f / 100 * scale * line.prices[channel].to_f }
      end

      def sum_active(rows, year)
        rows.select { _1.active_in?(year) }.sum { _1.amount.to_f }
      end

      def carbon_revenue(year)
        carbon = @inputs.carbon
        return 0.0 unless carbon.enabled && year >= carbon.start_year
        carbon.t_co2_per_ha_year.to_f * carbon.price_per_t.to_f * @area_ha.to_f
      end

      def variable_costs(year, sold_kg:, sales:)
        @inputs.variable_costs.select { _1.active_in?(year) }.sum do |cost|
          case cost.basis
          when "per_kg" then cost.rate.to_f * sold_kg
          when "per_ha" then cost.rate.to_f * @area_ha.to_f
          when "pct_sales" then cost.rate.to_f / 100 * sales
          else 0.0
          end
        end
      end

      # Every investment as { amount, year, depreciation_years }: the rows
      # entered by the user plus the plants of each species line (bought in
      # their planting year, losses replaced the following year).
      def investment_items
        @investment_items ||= begin
          items = @inputs.investments.filter_map do |row|
            { amount: row.amount.to_f, year: row.year, years: row.effective_depreciation_years, category: row.category } if row.amount.to_f.positive?
          end
          lines_with_plants.each do |line|
            cost = line.quantity * line.unit_price.to_f
            next unless cost.positive?
            items << { amount: cost, year: line.planting_year, years: @settings.plant_depreciation_years, category: "plants" }
            replacement = cost * @settings.plant_replacement_pct.to_f / 100
            if replacement.positive? && line.planting_year < YEARS
              items << { amount: replacement, year: line.planting_year + 1, years: @settings.plant_depreciation_years, category: "plants" }
            end
          end
          items
        end
      end

      def investment_schedule
        total = Array.new(YEARS, 0.0)
        by_category = Hash.new(0.0)
        investment_items.each do |item|
          total[item[:year] - 1] += item[:amount]
          by_category[item[:category]] += item[:amount]
        end
        { total:, by_category: }
      end

      def depreciation_schedule
        schedule = Array.new(YEARS, 0.0)
        investment_items.each do |item|
          annual = item[:amount] / item[:years]
          (item[:year]...[ item[:year] + item[:years], YEARS + 1 ].min).each { schedule[_1 - 1] += annual }
        end
        schedule
      end

      # Constant annuities; interest on the balance outstanding at the
      # start of each year. Years beyond the horizon are left out (the
      # remaining balance is reported).
      def loan_schedule
        received = Array.new(YEARS, 0.0)
        interest = Array.new(YEARS, 0.0)
        principal = Array.new(YEARS, 0.0)
        balance_end = 0.0
        @inputs.loans.each do |loan|
          amount = loan.amount.to_f
          next unless amount.positive? && loan.years
          rate = loan.rate_pct.to_f / 100
          annuity = rate.zero? ? amount / loan.years : amount * rate / (1 - (1 + rate)**-loan.years)
          balance = amount
          received[loan.start_year - 1] += amount
          loan.years.times do |k|
            year = loan.start_year + k
            break if year > YEARS
            year_interest = balance * rate
            repaid = [ annuity - year_interest, balance ].min
            interest[year - 1] += year_interest
            principal[year - 1] += repaid
            balance -= repaid
          end
          balance_end += balance
        end
        { received:, interest:, principal:, balance_end: }
      end

      def indicators(years, investments, loans)
        lowest = years.min_by(&:cumulative_cash)
        peak = years.max_by(&:harvest_kg)
        project_cash = 0.0
        project_cumulative = years.map { |year| project_cash += year.ebitda - year.investments }
        {
          horizon_years: YEARS,
          start_year: @settings.start_year,
          area_ha: @area_ha&.round(4),
          total_investment: investment_items.sum { _1[:amount] },
          investment_by_category: investments[:by_category].transform_values { _1.round(2) },
          total_revenue: years.sum(&:revenue),
          total_subsidies: years.sum(&:subsidies),
          total_result: years.sum(&:result),
          break_even_year: first_year_staying_positive(years.map(&:result)),
          payback_year: first_year_staying_positive(project_cumulative),
          lowest_cash: lowest.cumulative_cash,
          lowest_cash_year: lowest.year,
          funding_need: [ -lowest.cumulative_cash, 0.0 ].max,
          final_cash: years.last.cumulative_cash,
          peak_harvest_year: peak.harvest_kg.positive? ? peak.year : nil,
          peak_harvest_kg: peak.harvest_kg.round(1),
          peak_picking_hours: peak.picking_hours.round(1),
          loan_balance_end: loans[:balance_end]
        }
      end

      # First plan year from which the series stays >= 0 until the horizon.
      def first_year_staying_positive(series)
        return nil if series.empty? || series.all?(&:zero?) || series.last.negative?
        index = series.rindex(&:negative?)
        index ? index + 2 : 1
      end

      def warnings
        list = []
        list << { "code" => "no_species" } if lines_with_plants.empty?
        add = ->(code, lines) { list << { "code" => code, "names" => lines.map { _1.name || _1.latin_name || "?" } } if lines.any? }
        add.call("missing_yield", lines_with_plants - productive_species)
        add.call("missing_channels", productive_species.select { _1.shares.values.sum(&:to_f).zero? })
        add.call("shares_over_100", productive_species.select { _1.shares.values.sum(&:to_f) > 100 })
        add.call("missing_price", productive_species.select { |line| CHANNELS.any? { line.shares[_1].to_f.positive? && line.prices[_1].nil? } })
        add.call("missing_picking_rate", productive_species.select { _1.picking_rate_kg_per_hour.to_f.zero? })
        add.call("missing_unit_price", lines_with_plants.select { _1.unit_price.nil? })
        if @settings.labour_cost_per_hour.nil? && productive_species.any? { _1.picking_rate_kg_per_hour.to_f.positive? }
          list << { "code" => "missing_labour_cost" }
        end
        uses_area = @inputs.variable_costs.any? { _1.basis == "per_ha" && _1.rate.to_f.positive? } || @inputs.carbon.enabled
        list << { "code" => "missing_area" } if uses_area && @area_ha.to_f.zero?
        list
      end
  end
end
