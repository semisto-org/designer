# The water a pond, swale or rain garden holds when full, in m³, as the
# inspector shows it (app/frontend/map/drawing/computed.ts): a pond's bowl is
# about half its area × depth, a swale's trench half its section × length
# (a keyline dug as a swale too), a rain garden its area × depth. nil
# without the sizes it needs.
module MapFeature::WaterCapacity
  WATER_CAPACITY_KINDS = %w[pond swale keyline rain_garden].freeze

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
    end
  end
end
