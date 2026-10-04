module SoilAnalysis
  # Reads a soil sample's results against general reference bands (low / ok /
  # high), with a plain French explanation of each band. INDICATIVE ONLY: the
  # bands are broad repères for a loamy Walloon soil analysed with the usual
  # methods (pH in water and in KCl, P, K, Mg, Ca extracted with ammonium
  # acetate-EDTA and given in mg per 100 g of dry soil, CEC in méq/100 g).
  # A lab's own thresholds depend on the method, the texture and the land use:
  # when its report gives some, they win. Provenance of the numbers:
  # « repères généraux semisto, à vérifier ».
  module Interpretation
    PROVENANCE = "semisto, à vérifier".freeze

    # key => unit, valid range, and the band limits: below `low_below` is low,
    # above `high_above` is high, in between is ok.
    FIELDS = {
      "ph_water"           => { unit: nil,          range: 0..14,   low_below: 5.5, high_above: 7.5 },
      "ph_kcl"             => { unit: nil,          range: 0..14,   low_below: 5.0, high_above: 7.0 },
      "organic_matter_pct" => { unit: "%",          range: 0..100,  low_below: 2.0, high_above: 6.0 },
      "c_n_ratio"          => { unit: nil,          range: 1..100,  low_below: 8.0, high_above: 13.0 },
      "p_mg_100g"          => { unit: "mg/100 g",   range: 0..1000, low_below: 3.0, high_above: 9.0 },
      "k_mg_100g"          => { unit: "mg/100 g",   range: 0..1000, low_below: 8.0, high_above: 25.0 },
      "mg_mg_100g"         => { unit: "mg/100 g",   range: 0..1000, low_below: 4.0, high_above: 16.0 },
      "ca_mg_100g"         => { unit: "mg/100 g",   range: 0..5000, low_below: 100.0, high_above: 600.0 },
      "cec_meq_100g"       => { unit: "méq/100 g",  range: 0..150,  low_below: 8.0, high_above: 25.0 },
      "sand_pct"           => { unit: "%",          range: 0..100 },
      "silt_pct"           => { unit: "%",          range: 0..100 },
      "clay_pct"           => { unit: "%",          range: 0..100 }
    }.freeze

    # The parameters that get a band, in the order of the compare table.
    BANDED = FIELDS.select { |_, f| f[:low_below] }.keys.freeze
    BANDS = %w[low ok high].freeze

    module_function

    # "low" | "ok" | "high" | nil
    def band(key, value)
      spec = FIELDS[key]
      return nil unless spec && spec[:low_below] && value.is_a?(Numeric)
      if value < spec[:low_below] then "low"
      elsif value > spec[:high_above] then "high"
      else "ok"
      end
    end

    # The reading of one sample:
    #   { parameters: [{ key:, value:, unit:, band:, explanation: }], texture: { key:, name:, description, sand:, silt:, clay: } | nil }
    def for(sample)
      results = sample.results.to_h
      parameters = BANDED.filter_map do |key|
        value = results[key]
        next unless value.is_a?(Numeric)
        band = band(key, value)
        { key:, value:, unit: FIELDS[key][:unit], band:, explanation: I18n.t("soil.interpretation.#{key}.#{band}") }
      end
      { parameters:, texture: texture(results), provenance: PROVENANCE }
    end

    def texture(results)
      fractions = TextureClass.normalize(sand: results["sand_pct"], silt: results["silt_pct"], clay: results["clay_pct"]) or return nil
      key = TextureClass.classify(**fractions)
      { key:, name: TextureClass.label(key), description: TextureClass.description(key),
        sand: fractions[:sand].round(1), silt: fractions[:silt].round(1), clay: fractions[:clay].round(1) }
    end
  end
end
