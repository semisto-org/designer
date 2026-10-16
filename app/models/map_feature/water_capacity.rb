# The water a pond, swale or rain garden holds when full, in m³, as the
# inspector shows it (app/frontend/map/drawing/computed.ts): a pond's bowl is
# about half its area × depth, a swale's trench half its section × length
# (a keyline dug as a swale too), a rain garden its area × depth, a
# half-moon half a disc × depth × 0.5 (a bowl), one per point or one every
# `spacing_m` along a line. nil
# without the sizes it needs.
module MapFeature::WaterCapacity
  WATER_CAPACITY_KINDS = %w[pond swale keyline rain_garden half_moon].freeze

  def water_capacity_m3
    return nil unless WATER_CAPACITY_KINDS.include?(kind)

    p = properties.to_h
    depth = p["depth_m"].to_f
    return nil unless depth.positive?

    measures = measure_geometry
    case kind
    when "pond" then measures["area"].to_f * depth * 0.5
    when "swale", "keyline"
      return nil if kind == "keyline" && p["use"].present? && p["use"] != "swale"

      p["width_m"].to_f.positive? ? measures["length"].to_f * p["width_m"].to_f * depth * 0.5 : nil
    when "rain_garden" then measures["area"].to_f * depth
    when "half_moon"
      diameter = p["diameter_m"].to_f
      count = half_moon_count
      diameter.positive? && count ? count * Math::PI * (diameter / 2)**2 / 2 * depth * 0.5 : nil
    end
  end

  # One half-moon for a point; along a line, one every `spacing_m`.
  def half_moon_count
    return 1 if geometry.respond_to?(:x)

    spacing = properties.to_h["spacing_m"].to_f
    spacing.positive? ? (measure_geometry["length"].to_f / spacing).floor + 1 : nil
  end
end
