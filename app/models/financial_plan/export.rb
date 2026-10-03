require "csv"

class FinancialPlan
  # The plan as files for a bank or a funder: CSV (the yearly tables,
  # Belgian Excel flavour: ";" separator, decimal comma, UTF-8 BOM) and
  # XLSX (summary, profit and loss, cash flow, harvest, assumptions).
  # Costs and cash outflows are negative numbers. Labels come from
  # config/locales/climate_finance.fr.yml (finances.export).
  class Export
    PNL_ROWS = [
      [ :sales, 1 ], [ :other_revenue, 1 ], [ :subsidies, 1 ], [ :carbon, 1 ], [ :revenue, 1, :total ],
      [ :fixed_costs, -1 ], [ :variable_costs, -1 ], [ :labour_cost, -1 ], [ :operating_costs, -1, :total ],
      [ :ebitda, 1, :total ], [ :depreciation, -1 ], [ :interest, -1 ], [ :result, 1, :total ]
    ].freeze
    CASH_ROWS = [
      [ :ebitda, 1 ], [ :interest, -1 ], [ :investments, -1 ], [ :loan_received, 1 ], [ :loan_repaid, -1 ],
      [ :net_cash_flow, 1, :total ], [ :cumulative_cash, 1, :total ]
    ].freeze
    HARVEST_ROWS = [ [ :harvest_kg, 1 ], [ :sold_kg, 1 ], [ :picking_hours, 1 ], [ :labour_cost, -1 ] ].freeze

    def initialize(plan)
      @plan = plan
      @result = plan.result
      @inputs = plan.typed_inputs
    end

    def filename(extension)
      "plan-financier-#{@plan.map.name.parameterize.presence || @plan.map_id}.#{extension}"
    end

    def to_csv
      body = CSV.generate(col_sep: ";") do |csv|
        csv << [ t("title", map: @plan.map.name) ]
        csv << [ t("disclaimer") ]
        csv << []
        csv << [ t("columns.item"), *years.map { |year| t("columns.year", year: year.year, calendar: year.calendar_year) } ]
        { "pnl" => PNL_ROWS, "cash" => CASH_ROWS, "harvest" => HARVEST_ROWS }.each do |section, rows|
          csv << []
          csv << [ t("sections.#{section}") ]
          rows.each { |key, sign, _| csv << [ t("rows.#{key}"), *years.map { decimal(year_value(_1, key, sign)) } ] }
        end
      end
      "﻿#{body}"
    end

    def to_xlsx
      package = Axlsx::Package.new
      package.use_shared_strings = true
      workbook = package.workbook
      @styles = build_styles(workbook)
      summary_sheet(workbook)
      table_sheet(workbook, t("sheets.pnl"), PNL_ROWS)
      table_sheet(workbook, t("sheets.cash"), CASH_ROWS)
      harvest_sheet(workbook)
      assumptions_sheet(workbook)
      package.to_stream.read
    end

    private
      def years = @result.years

      def t(key, **vars) = I18n.t("finances.export.#{key}", **vars)

      def year_value(year, key, sign)
        value = year.public_send(key).to_f * sign
        value.zero? ? 0.0 : value
      end

      def decimal(value) = format("%.2f", value).tr(".", ",")

      def build_styles(workbook)
        s = workbook.styles
        {
          title: s.add_style(b: true, sz: 14),
          note: s.add_style(i: true, fg_color: "6E6355", alignment: { wrap_text: true }),
          header: s.add_style(b: true, bg_color: "EDE9E3", border: { style: :thin, color: "DBD3C9", edges: [ :bottom ] }),
          label: s.add_style(alignment: { indent: 1 }),
          total_label: s.add_style(b: true),
          money: s.add_style(format_code: '#,##0 "€";[Red]-#,##0 "€"'),
          money_total: s.add_style(b: true, format_code: '#,##0 "€";[Red]-#,##0 "€"', border: { style: :thin, color: "C3B8AA", edges: [ :top ] }),
          number: s.add_style(format_code: "#,##0"),
          decimal: s.add_style(format_code: "#,##0.0"),
          percent: s.add_style(format_code: '0" %"')
        }
      end

      def summary_sheet(workbook)
        indicators = @result.indicators
        workbook.add_worksheet(name: t("sheets.summary")) do |sheet|
          sheet.add_row [ t("title", map: @plan.map.name) ], style: @styles[:title]
          sheet.add_row [ t("disclaimer") ], style: @styles[:note]
          sheet.add_row [ t("generated_on", date: Date.current.strftime("%d/%m/%Y")) ], style: @styles[:note]
          sheet.add_row []
          sheet.add_row [ t("summary.heading") ], style: @styles[:header]
          money = ->(key) { sheet.add_row [ t("summary.#{key}"), indicators[key].to_f ], style: [ @styles[:label], @styles[:money] ] }
          year = ->(key) { sheet.add_row [ t("summary.#{key}"), indicator_year(indicators[key]) ], style: [ @styles[:label], nil ] }
          sheet.add_row [ t("summary.area_ha"), indicators[:area_ha] ], style: [ @styles[:label], @styles[:decimal] ]
          money.call(:total_investment)
          money.call(:total_subsidies)
          money.call(:total_revenue)
          money.call(:total_result)
          year.call(:break_even_year)
          year.call(:payback_year)
          money.call(:funding_need)
          money.call(:final_cash)
          sheet.add_row [ t("summary.peak_harvest_kg"), indicators[:peak_harvest_kg] ], style: [ @styles[:label], @styles[:number] ]
          sheet.add_row [ t("summary.peak_picking_hours"), indicators[:peak_picking_hours] ], style: [ @styles[:label], @styles[:number] ]
          money.call(:loan_balance_end) if indicators[:loan_balance_end].to_f.positive?
          if @result.warnings.any?
            sheet.add_row []
            sheet.add_row [ t("summary.warnings") ], style: @styles[:header]
            @result.warnings.each do |warning|
              names = Array(warning["names"]).join(", ")
              sheet.add_row [ [ I18n.t("finances.warnings.#{warning['code']}"), names.presence ].compact.join(" : ") ], style: @styles[:note]
            end
          end
          sheet.column_widths 48, 18
        end
      end

      def indicator_year(year)
        return t("summary.never") unless year
        t("columns.year", year:, calendar: @result.indicators[:start_year] + year - 1)
      end

      def table_sheet(workbook, name, rows)
        workbook.add_worksheet(name:) do |sheet|
          sheet.add_row [ name ], style: @styles[:title]
          sheet.add_row [ t("disclaimer") ], style: @styles[:note]
          sheet.add_row [ t("columns.item"), *years.map(&:calendar_year) ], style: @styles[:header]
          sheet.add_row [ t("columns.plan_year"), *years.map(&:year) ], style: @styles[:header]
          rows.each do |key, sign, total|
            style = total ? @styles[:money_total] : @styles[:money]
            sheet.add_row [ t("rows.#{key}"), *years.map { year_value(_1, key, sign) } ],
              style: [ total ? @styles[:total_label] : @styles[:label], *Array.new(years.size, style) ]
          end
          sheet.column_widths 34, *Array.new(years.size, 11)
          sheet.sheet_view.pane { |pane| pane.state = :frozen; pane.x_split = 1; pane.y_split = 4; pane.top_left_cell = "B5" }
        end
      end

      def harvest_sheet(workbook)
        workbook.add_worksheet(name: t("sheets.harvest")) do |sheet|
          sheet.add_row [ t("sheets.harvest") ], style: @styles[:title]
          sheet.add_row [ t("columns.species"), *years.map(&:calendar_year) ], style: @styles[:header]
          @result.species.each do |line|
            sheet.add_row [ line.name, *line.harvest_kg.map { _1.round(1) } ], style: [ @styles[:label], *Array.new(years.size, @styles[:number]) ]
          end
          sheet.add_row [ t("rows.harvest_kg"), *years.map { _1.harvest_kg.round(1) } ], style: [ @styles[:total_label], *Array.new(years.size, @styles[:number]) ]
          sheet.add_row [ t("rows.picking_hours"), *years.map { _1.picking_hours.round(1) } ], style: [ @styles[:total_label], *Array.new(years.size, @styles[:number]) ]
          sheet.column_widths 34, *Array.new(years.size, 10)
        end
      end

      def assumptions_sheet(workbook)
        workbook.add_worksheet(name: t("sheets.assumptions")) do |sheet|
          sheet.add_row [ t("sheets.assumptions") ], style: @styles[:title]
          sheet.add_row [ t("assumptions.note") ], style: @styles[:note]
          settings = @inputs.settings
          section(sheet, t("assumptions.settings"), %w[field value],
            Schema::Settings.attribute_names.map { [ I18n.t("finances.fields.settings.#{_1}"), settings.public_send(_1) ] })
          section(sheet, t("assumptions.species"), species_columns, @inputs.species.map { |line| species_columns.map { line.public_send(_1) } }, translate: "species")
          { investments: %w[label category amount year depreciation_years],
            fixed_costs: %w[label amount start_year end_year],
            variable_costs: %w[label basis rate start_year end_year],
            other_revenues: %w[label kind amount start_year end_year],
            subsidies: %w[label kind amount start_year end_year],
            loans: %w[label amount rate_pct years start_year] }.each do |list, columns|
            rows = @inputs.public_send(list).map { |row| columns.map { |column| enum_label(list, column, row.public_send(column)) } }
            section(sheet, t("assumptions.#{list}"), columns, rows, translate: list.to_s)
          end
          carbon = @inputs.carbon
          section(sheet, t("assumptions.carbon"), %w[field value],
            Schema::Carbon.attribute_names.map { [ I18n.t("finances.fields.carbon.#{_1}"), carbon.public_send(_1) ] })
        end
      end

      def species_columns
        %w[name latin_name quantity unit_price planting_year first_harvest_age full_production_age yield_kg_per_plant
           picking_rate_kg_per_hour loss_pct] +
          Schema::CHANNELS.flat_map { [ "#{_1}_share_pct", "#{_1}_price" ] } + %w[notes]
      end

      def section(sheet, title, columns, rows, translate: nil)
        sheet.add_row []
        sheet.add_row [ title ], style: @styles[:total_label]
        return sheet.add_row([ t("assumptions.empty") ], style: @styles[:note]) if rows.empty?
        header = translate ? columns.map { I18n.t("finances.fields.#{translate}.#{_1}") } : columns.map { t("assumptions.#{_1}") }
        sheet.add_row header, style: @styles[:header]
        rows.each { |row| sheet.add_row row.map { _1 == true ? t("assumptions.yes") : _1 == false ? t("assumptions.no") : _1 } }
      end

      def enum_label(list, column, value)
        return value unless %w[category kind basis].include?(column) && value
        I18n.t("finances.options.#{list}.#{value}", default: value)
      end
  end
end
