# A map's relief and its water parameters: the imported terrain, and the
# rainfall, roof and soil settings used by the water analyses, stored per map
# over the region's defaults (`Region#setting(:hydrology)`).
module HasTerrain
  extend ActiveSupport::Concern

  # Fallbacks for a region without hydrology defaults: the user is asked for
  # the rainfall, everything else stays a generic order of magnitude.
  GENERIC_HYDROLOGY = {
    "annual_rainfall_mm" => nil,
    "roof_coefficient" => 0.8,
    "soil" => "loam",
    "uniform_rate_mm_h" => 10,
    "storage_mm" => 50,
    "percolation_mm_h" => 0.5,
    "soils" => {
      "clay" => { "rate_factor" => 0.4, "storage_factor" => 1.2 },
      "loam" => { "rate_factor" => 1.0, "storage_factor" => 1.0 },
      "stony" => { "rate_factor" => 1.4, "storage_factor" => 0.8 },
      "sandy" => { "rate_factor" => 2.5, "storage_factor" => 0.6 }
    }
  }.freeze

  # What a user may change on a map, and the accepted ranges.
  WATER_RANGES = {
    "annual_rainfall_mm" => 100..5000,
    "roof_coefficient" => 0.1..1.0,
    "uniform_rate_mm_h" => 0..500,
    "storage_mm" => 0..500
  }.freeze
  WATER_KEYS = (WATER_RANGES.keys + %w[soil]).freeze

  included do
    has_one :terrain, class_name: "MapTerrain", dependent: :destroy
    validate :water_settings_are_valid
  end

  def hydrology_defaults
    region_defaults = region&.setting(:hydrology)
    GENERIC_HYDROLOGY.merge(region_defaults.is_a?(Hash) ? region_defaults : {})
  end

  # Region defaults with this map's own choices on top.
  def effective_water_settings
    defaults = hydrology_defaults
    own = (water_settings || {}).slice(*WATER_KEYS).compact
    merged = defaults.slice(*WATER_KEYS).merge(own)
    soil = defaults["soils"].to_h[merged["soil"]] || defaults["soils"].to_h.values.first || {}
    merged.merge(
      "percolation_mm_h" => defaults["percolation_mm_h"],
      "rate_factor" => soil["rate_factor"] || 1.0,
      "storage_factor" => soil["storage_factor"] || 1.0
    )
  end

  # Assign only known keys; blank values fall back to the region's defaults.
  def water_settings=(value)
    value = value.to_unsafe_h if value.respond_to?(:to_unsafe_h)
    cleaned = value.to_h.stringify_keys.slice(*WATER_KEYS).each_with_object({}) do |(key, raw), out|
      next if raw.nil? || raw == ""

      out[key] = key == "soil" ? raw.to_s : (Float(raw, exception: false) || raw)
    end
    super(cleaned)
  end

  private
    def water_settings_are_valid
      (water_settings || {}).each do |key, value|
        if key == "soil"
          errors.add(:water_settings, I18n.t("relief.errors.unknown_soil")) unless hydrology_defaults["soils"].to_h.key?(value)
        elsif (range = WATER_RANGES[key]) && !(value.is_a?(Numeric) && range.cover?(value))
          errors.add(:water_settings, I18n.t("relief.errors.out_of_range", field: I18n.t("relief.settings.#{key}"), min: range.min, max: range.max))
        end
      end
    end
end
