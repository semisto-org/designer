module SoilAnalysis
  # Texture class from the sand / silt / clay percentages, with the 12
  # classes of the USDA texture triangle (the usual reference for soil
  # reports), named in French.
  #
  # The decision rules are the standard ones for the triangle (clay % `c`,
  # silt % `z`, sand % `s`); they cover every point of it without gaps (a test
  # walks the whole triangle).
  module TextureClass
    CLASSES = %w[
      sand loamy_sand sandy_loam loam silt_loam silt
      sandy_clay_loam clay_loam silty_clay_loam sandy_clay silty_clay clay
    ].freeze

    # The three fractions may be rounded by the lab: a total within this many
    # points of 100 is accepted and rescaled.
    SUM_TOLERANCE = 3.0

    module_function

    # Returns the class key (e.g. "silt_loam") or nil when the percentages
    # cannot form a texture. Two fractions are enough: the third is the rest.
    def classify(sand:, silt:, clay:)
      fractions = normalize(sand:, silt:, clay:) or return nil
      s, z, c = fractions.values_at(:sand, :silt, :clay)
      if z + 1.5 * c < 15 then "sand"
      elsif z + 1.5 * c >= 15 && z + 2 * c < 30 then "loamy_sand"
      elsif (c >= 7 && c < 20 && s > 52 && z + 2 * c >= 30) || (c < 7 && z < 50 && z + 2 * c >= 30) then "sandy_loam"
      elsif c >= 7 && c < 27 && z >= 28 && z < 50 && s <= 52 then "loam"
      elsif (z >= 50 && c >= 12 && c < 27) || (z >= 50 && z < 80 && c < 12) then "silt_loam"
      elsif z >= 80 && c < 12 then "silt"
      elsif c >= 20 && c < 35 && z < 28 && s > 45 then "sandy_clay_loam"
      elsif c >= 27 && c < 40 && s > 20 && s <= 45 then "clay_loam"
      elsif c >= 27 && c < 40 && s <= 20 then "silty_clay_loam"
      elsif c >= 35 && s > 45 then "sandy_clay"
      elsif c >= 40 && z >= 40 then "silty_clay"
      elsif c >= 40 && s <= 45 && z < 40 then "clay"
      end
    end

    # { sand:, silt:, clay: } summing to 100, from two or three fractions;
    # nil if they are not numbers, negative or do not add up.
    def normalize(sand:, silt:, clay:)
      raw = { sand:, silt:, clay: }
      values = raw.transform_values { |v| number(v) }
      # Something typed but unreadable is an error, not an absent fraction.
      return nil if raw.any? { |key, v| !blank?(v) && values[key].nil? }
      given = values.compact
      return nil if given.size < 2 || given.values.any? { |v| v.negative? || v > 100 }
      if given.size == 2
        missing = values.key(nil)
        values[missing] = 100.0 - given.values.sum
        return nil if values[missing].negative?
        return values
      end
      total = values.values.sum
      return nil if (total - 100).abs > SUM_TOLERANCE
      values.transform_values { |v| v * 100.0 / total }
    end

    # Whether the three given fractions are consistent (for validations).
    def consistent?(sand:, silt:, clay:)
      !normalize(sand:, silt:, clay:).nil?
    end

    def label(key) = I18n.t("soil.texture.classes.#{key}.name")
    def description(key) = I18n.t("soil.texture.classes.#{key}.description")

    def blank?(value) = value.nil? || value.to_s.strip.empty?

    def number(value)
      return nil if blank?(value)
      Float(value.to_s.tr(",", "."))
    rescue ArgumentError
      nil
    end
  end
end
