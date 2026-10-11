class Offer
  # The document the team edits (offers.inputs and each version's copy):
  # rates, the internal sheet (services, adjustments, notes), the scope of
  # the offer on the map, trips, and the team's corrections to the computed
  # lines and prices. `Offer::Inputs.normalize(raw)` is the only way in:
  # unknown keys are dropped, numbers are clamped, blanks stay nil (never 0),
  # every list row gets a stable id. Keys are snake_case strings.
  module Inputs
    MAX_STRING = 200
    MAX_NOTES = 4_000
    ADJUSTMENT_PHASES = [ "all", *Catalog::PHASES ].freeze
    CUSTOM_KINDS = %w[hours amount].freeze

    # Rates and settings: [default, min, max].
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

    # Adjustments the team picks in the internal sheet, with their default
    # percentage and phase. The team can change both, or add its own.
    ADJUSTMENT_PRESETS = {
      "difficult_access" => [ 10, "implementation" ],
      "steep_slope" => [ 10, "implementation" ],
      "complex_project" => [ 10, "all" ],
      "simple_project" => [ -10, "all" ]
    }.freeze

    module_function

    def normalize(raw)
      raw = hash(raw)
      {
        "settings" => settings(raw["settings"]),
        "services" => services(raw["services"]),
        "scope" => list(raw["scope"], 100) { scope_item(_1) },
        "trips" => list(raw["trips"], 30) { trip(_1) },
        "lines" => list(raw["lines"], 200) { line_override(_1) },
        "custom_lines" => list(raw["custom_lines"], 100) { custom_line(_1) },
        "adjustments" => list(raw["adjustments"], 20) { adjustment(_1) },
        "prices" => prices(raw["prices"]),
        "plant_prices" => plant_prices(raw["plant_prices"]),
        "notes" => string(raw["notes"], MAX_NOTES)
      }
    end

    def settings(raw)
      raw = hash(raw)
      SETTINGS.to_h do |key, (default, min, max)|
        value = number(raw[key])
        value = default if value.nil?
        value = value.clamp(min, max)
        value = value.round if key == "designers"
        [ key, value ]
      end
    end

    # { "pond" => true, "co_author" => false }: services the team decided.
    # A service the team never touched is absent (its suggestion applies).
    def services(raw)
      raw = hash(raw)
      Catalog::SERVICES.each_with_object({}) do |key, memo|
        value = boolean(raw[key])
        memo[key] = value unless value.nil?
      end
    end

    # An element of the scope: a drawn feature, or a measure typed by hand.
    def scope_item(raw)
      type = raw["planting_type"].to_s
      {
        "id" => id(raw["id"]),
        "feature_id" => integer(raw["feature_id"])&.then { _1.positive? ? _1 : nil },
        "label" => string(raw["label"]),
        "planting_type" => Catalog::PLANTING_TYPES.key?(type) ? type : "forest_garden",
        "measure" => number(raw["measure"])&.clamp(0, 100_000_000),
        "plants_override" => integer(raw["plants_override"])&.clamp(0, 1_000_000),
        "option" => boolean(raw["option"]) || false
      }
    end

    def trip(raw)
      phase = raw["phase"].to_s
      {
        "id" => id(raw["id"]),
        "phase" => Catalog::PHASES.include?(phase) ? phase : "pre_design",
        "label" => string(raw["label"]),
        "trips" => number(raw["trips"])&.clamp(0, 1_000),
        "one_way_km" => number(raw["one_way_km"])&.clamp(0, 5_000)
      }
    end

    # A correction of a computed line, by its key ("design.planting_plan").
    def line_override(raw)
      key = raw["key"].to_s
      return nil unless key.match?(/\A[a-z_]+\.[a-z_]+\z/)
      {
        "key" => key,
        "persons" => number(raw["persons"])&.clamp(0, 20),
        "hours" => number(raw["hours"])&.clamp(0, 10_000),
        "amount" => number(raw["amount"])&.clamp(0, 10_000_000),
        "disabled" => boolean(raw["disabled"]) || false
      }
    end

    def custom_line(raw)
      phase = raw["phase"].to_s
      kind = raw["kind"].to_s
      {
        "id" => id(raw["id"]),
        "phase" => Catalog::PHASES.include?(phase) ? phase : "pre_design",
        "kind" => CUSTOM_KINDS.include?(kind) ? kind : "hours",
        "label" => string(raw["label"]),
        "persons" => number(raw["persons"])&.clamp(0, 20),
        "hours" => number(raw["hours"])&.clamp(0, 10_000),
        "amount" => number(raw["amount"])&.clamp(-10_000_000, 10_000_000),
        "option" => boolean(raw["option"]) || false
      }
    end

    def adjustment(raw)
      preset = raw["preset"].to_s
      preset = nil unless ADJUSTMENT_PRESETS.key?(preset)
      phase = raw["phase"].to_s
      default_pct, default_phase = ADJUSTMENT_PRESETS[preset]
      pct = number(raw["pct"])
      {
        "id" => id(raw["id"]),
        "preset" => preset,
        "label" => string(raw["label"]),
        "pct" => (pct.nil? ? default_pct || 0 : pct).clamp(-90, 300),
        "phase" => ADJUSTMENT_PHASES.include?(phase) ? phase : default_phase || "all"
      }
    end

    # Prices the team shows the client instead of the computed ones (TVAC):
    # { "pre_design" => { "fees" => 4500, "expenses" => 320 } }.
    def prices(raw)
      raw = hash(raw)
      Catalog::PHASES.each_with_object({}) do |phase, memo|
        values = hash(raw[phase]).slice("fees", "expenses").transform_values { number(_1)&.clamp(0, 10_000_000) }.compact
        memo[phase] = values if values.any?
      end
    end

    def plant_prices(raw)
      raw = hash(raw)
      Catalog::CATEGORIES.keys.each_with_object({}) do |category, memo|
        value = number(raw[category])
        memo[category] = value.clamp(0, 100_000) unless value.nil?
      end
    end

    def list(raw, max, &)
      raw = raw.values if raw.is_a?(Hash) # form-encoded arrays
      Array(raw).first(max).filter_map { _1.is_a?(Hash) || _1.respond_to?(:to_unsafe_h) ? yield(hash(_1)) : nil }
    end

    def hash(raw)
      raw = raw.to_unsafe_h if raw.respond_to?(:to_unsafe_h)
      raw = JSON.parse(raw) if raw.is_a?(String) && raw.start_with?("{")
      return {} unless raw.is_a?(Hash)
      raw.to_h { |key, value| [ key.to_s.underscore, value ] }
    rescue JSON::ParserError
      {}
    end

    def number(value)
      return nil if value.is_a?(Float) && !value.finite?
      return value.to_f if value.is_a?(Numeric)
      return nil unless value.is_a?(String)
      text = value.strip.delete("   ").tr(",", ".")
      text.match?(/\A-?\d+(\.\d+)?\z/) ? text.to_f : nil
    end

    def integer(value) = number(value)&.round

    def boolean(value)
      return true if [ true, "true", "1", 1 ].include?(value)
      return false if [ false, "false", "0", 0 ].include?(value)
      nil
    end

    def string(value, limit = MAX_STRING)
      value.is_a?(String) || value.is_a?(Numeric) ? value.to_s.strip.first(limit).presence : nil
    end

    def id(value) = value.to_s.match?(/\A[\w-]{1,64}\z/) ? value.to_s : SecureRandom.uuid
  end
end
