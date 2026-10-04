class FinancialPlan
  # The typed document stored in financial_plans.inputs: every assumption
  # of the plan, entered by the user (nothing is prefilled from third-party
  # datasets). Each row type declares typed attributes (ActiveModel) and
  # normalises itself on read: blank or invalid numbers become nil (never
  # 0), years and percentages are clamped, enums fall back to a default and
  # every list row gets a stable id.
  #
  # Years are plan years, 1 to HORIZON_YEARS (year 1 = settings.start_year).
  # Amounts are euros excluding VAT, in constant euros (no inflation).
  module Schema
    HORIZON_YEARS = 20
    CHANNELS = %w[retail restaurant direct].freeze
    MAX_STRING = 200

    class Row
      include ActiveModel::API
      include ActiveModel::Attributes

      class_attribute :enums, default: {}

      def self.enum_attribute(name, values, default:)
        attribute name, :string, default: default
        self.enums = enums.merge(name.to_s => [ values.freeze, default ])
      end

      # Accepts a Hash (string, symbol or camelCase keys) or
      # ActionController::Parameters; unknown keys are ignored.
      def self.from(raw)
        raw = raw.to_unsafe_h if raw.respond_to?(:to_unsafe_h)
        raw = {} unless raw.is_a?(Hash)
        raw = raw.to_h { |key, value| [ key.to_s.underscore, value ] }
        values = attribute_types.each_with_object({}) do |(name, type), memo|
          memo[name] = sanitize(raw[name], type.type) if raw.key?(name)
        end
        new(**values.symbolize_keys).tap(&:normalize!)
      end

      def self.sanitize(value, type)
        case type
        when :float, :integer, :decimal
          return nil if value.is_a?(Float) && !value.finite?
          return value if value.is_a?(Numeric)
          return nil unless value.is_a?(String)
          text = value.strip.delete("   ").tr(",", ".")
          text.match?(/\A-?\d+(\.\d+)?\z/) ? text : nil
        when :string
          value.is_a?(String) || value.is_a?(Numeric) || value.is_a?(Symbol) ? value.to_s.strip.first(MAX_STRING).presence : nil
        when :boolean
          [ true, false, "true", "false", "1", "0", 1, 0 ].include?(value) ? value : nil
        else
          value
        end
      end

      def to_h = attributes

      def normalize!
        enums.each do |name, (values, default)|
          public_send("#{name}=", default) unless values.include?(public_send(name))
        end
        self
      end

      private
        def clamp(name, min, max)
          value = public_send(name)
          public_send("#{name}=", value.clamp(min, max)) unless value.nil?
        end

        def clamp_year(name, default: nil)
          public_send("#{name}=", default) if public_send(name).nil? && default
          clamp(name, 1, HORIZON_YEARS)
        end

        def ensure_id
          self.id = SecureRandom.uuid unless id.to_s.match?(/\A[\w-]{1,64}\z/)
        end
    end

    # General assumptions.
    class Settings < Row
      attribute :start_year, :integer
      attribute :area_ha, :float
      attribute :labour_cost_per_hour, :float
      attribute :opening_cash, :float
      attribute :plant_replacement_pct, :float
      attribute :plant_depreciation_years, :integer

      def normalize!
        super
        self.start_year = Date.current.year if start_year.nil?
        clamp(:start_year, 2000, 2100)
        clamp(:area_ha, 0, 100_000)
        clamp(:labour_cost_per_hour, 0, 1_000)
        clamp(:opening_cash, -100_000_000, 100_000_000)
        clamp(:plant_replacement_pct, 0, 100)
        self.plant_depreciation_years = 10 if plant_depreciation_years.nil?
        clamp(:plant_depreciation_years, 1, 50)
        self
      end
    end

    # One species (or palette item) of the plan: plants bought, yield curve
    # by plant age, sales channels and picking time.
    class SpeciesLine < Row
      attribute :id, :string
      attribute :source_key, :string           # MapPlantInventory line key, to sync with the map
      attribute :name, :string
      attribute :latin_name, :string
      attribute :quantity, :integer
      attribute :unit_price, :float            # € per plant (investment)
      attribute :planting_year, :integer, default: 1
      attribute :first_harvest_age, :integer   # plant age (1 = planting year) of the first harvest
      attribute :full_production_age, :integer # age from which the yield is at its maximum
      attribute :yield_kg_per_plant, :float    # at maturity
      attribute :picking_rate_kg_per_hour, :float
      attribute :loss_pct, :float              # harvested but not sold (damaged, own use…)
      CHANNELS.each do |channel|
        attribute :"#{channel}_share_pct", :float # % of the sold harvest going to this channel
        attribute :"#{channel}_price", :float     # € per kg
      end
      attribute :notes, :string                # where the figures come from

      def normalize!
        super
        ensure_id
        clamp(:quantity, 0, 10_000_000)
        clamp(:unit_price, 0, 100_000)
        clamp_year(:planting_year, default: 1)
        clamp(:first_harvest_age, 1, 100)
        clamp(:full_production_age, 1, 100)
        clamp(:yield_kg_per_plant, 0, 100_000)
        clamp(:picking_rate_kg_per_hour, 0, 10_000)
        clamp(:loss_pct, 0, 100)
        CHANNELS.each do |channel|
          clamp(:"#{channel}_share_pct", 0, 100)
          clamp(:"#{channel}_price", 0, 100_000)
        end
        if first_harvest_age && full_production_age && full_production_age < first_harvest_age
          self.full_production_age = first_harvest_age
        end
        self
      end

      def shares = CHANNELS.to_h { [ _1, public_send(:"#{_1}_share_pct") ] }
      def prices = CHANNELS.to_h { [ _1, public_send(:"#{_1}_price") ] }
    end

    class Investment < Row
      CATEGORIES = %w[plants earthworks fencing equipment design other].freeze
      DEFAULT_DEPRECIATION_YEARS = { "plants" => 10, "earthworks" => 10, "fencing" => 10, "equipment" => 5, "design" => 5, "other" => 5 }.freeze

      attribute :id, :string
      attribute :label, :string
      enum_attribute :category, CATEGORIES, default: "other"
      attribute :amount, :float
      attribute :year, :integer, default: 1
      attribute :depreciation_years, :integer

      def normalize!
        super
        ensure_id
        clamp(:amount, 0, 100_000_000)
        clamp_year(:year, default: 1)
        clamp(:depreciation_years, 1, 50)
        self
      end

      def effective_depreciation_years = depreciation_years || DEFAULT_DEPRECIATION_YEARS.fetch(category)
    end

    # A yearly amount over a span of plan years (end_year nil = until the end).
    class YearlyRow < Row
      attribute :id, :string
      attribute :label, :string
      attribute :amount, :float
      attribute :start_year, :integer, default: 1
      attribute :end_year, :integer

      def normalize!
        super
        ensure_id
        clamp(:amount, 0, 100_000_000)
        clamp_year(:start_year, default: 1)
        clamp_year(:end_year)
        self.end_year = start_year if end_year && end_year < start_year
        self
      end

      def active_in?(year) = year >= start_year && (end_year.nil? || year <= end_year)
    end

    class FixedCost < YearlyRow; end

    class OtherRevenue < YearlyRow
      KINDS = %w[workshops visits wood other].freeze
      enum_attribute :kind, KINDS, default: "other"
    end

    class Subsidy < YearlyRow
      KINDS = %w[pac hedges agroforestry other].freeze
      enum_attribute :kind, KINDS, default: "other"
    end

    # Costs proportional to the activity.
    class VariableCost < Row
      BASES = %w[per_kg per_ha pct_sales].freeze

      attribute :id, :string
      attribute :label, :string
      enum_attribute :basis, BASES, default: "per_kg"
      attribute :rate, :float # € per kg sold, € per hectare, or % of sales
      attribute :start_year, :integer, default: 1
      attribute :end_year, :integer

      def normalize!
        super
        ensure_id
        clamp(:rate, 0, basis == "pct_sales" ? 100 : 1_000_000)
        clamp_year(:start_year, default: 1)
        clamp_year(:end_year)
        self.end_year = start_year if end_year && end_year < start_year
        self
      end

      def active_in?(year) = year >= start_year && (end_year.nil? || year <= end_year)
    end

    # Optional estimate of carbon stored, valued at a price per tonne.
    class Carbon < Row
      attribute :enabled, :boolean, default: false
      attribute :t_co2_per_ha_year, :float
      attribute :price_per_t, :float
      attribute :start_year, :integer, default: 1

      def normalize!
        super
        self.enabled = false if enabled.nil?
        clamp(:t_co2_per_ha_year, 0, 1_000)
        clamp(:price_per_t, 0, 10_000)
        clamp_year(:start_year, default: 1)
        self
      end
    end

    # A bank loan repaid by constant annuities.
    class Loan < Row
      attribute :id, :string
      attribute :label, :string
      attribute :amount, :float
      attribute :rate_pct, :float
      attribute :years, :integer
      attribute :start_year, :integer, default: 1

      def normalize!
        super
        ensure_id
        clamp(:amount, 0, 100_000_000)
        clamp(:rate_pct, 0, 50)
        clamp(:years, 1, 40)
        clamp_year(:start_year, default: 1)
        self
      end
    end
  end
end
