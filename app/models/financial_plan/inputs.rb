class FinancialPlan
  # The whole inputs document, typed: general settings, carbon option and
  # the lists of rows. `FinancialPlan::Inputs.from(anything).to_h` is the
  # normalised, storable form.
  class Inputs
    LISTS = {
      species: [ Schema::SpeciesLine, 300 ],
      investments: [ Schema::Investment, 100 ],
      fixed_costs: [ Schema::FixedCost, 100 ],
      variable_costs: [ Schema::VariableCost, 100 ],
      other_revenues: [ Schema::OtherRevenue, 100 ],
      subsidies: [ Schema::Subsidy, 100 ],
      loans: [ Schema::Loan, 20 ]
    }.freeze

    attr_reader :settings, :carbon, *LISTS.keys

    def self.from(raw)
      return raw if raw.is_a?(Inputs)
      raw = raw.to_unsafe_h if raw.respond_to?(:to_unsafe_h)
      raw = JSON.parse(raw) if raw.is_a?(String) && raw.present?
      raw = {} unless raw.is_a?(Hash)
      raw = raw.to_h { |key, value| [ key.to_s.underscore, value ] }
      new(
        settings: Schema::Settings.from(raw["settings"]),
        carbon: Schema::Carbon.from(raw["carbon"]),
        **LISTS.to_h do |name, (row_class, max)|
          rows = raw[name.to_s]
          rows = rows.values if rows.is_a?(Hash) # form-encoded arrays
          [ name, Array(rows).first(max).map { row_class.from(_1) } ]
        end
      )
    rescue JSON::ParserError
      from({})
    end

    def initialize(settings:, carbon:, **lists)
      @settings = settings
      @carbon = carbon
      LISTS.each_key { |name| instance_variable_set("@#{name}", lists.fetch(name, [])) }
    end

    def to_h
      {
        "settings" => settings.to_h,
        "carbon" => carbon.to_h,
        **LISTS.keys.to_h { |name| [ name.to_s, public_send(name).map(&:to_h) ] }
      }
    end
  end
end
