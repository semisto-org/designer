module SoilAnalysis
  # Reads a soil sample's results against reference bands (low / ok /
  # high), with a plain French explanation of each band. INDICATIVE ONLY: the
  # bands come from the Walloon references for loamy soils analysed with the
  # usual methods (pH in water and in KCl, P, K, Mg, Ca extracted with
  # ammonium acetate-EDTA and given in mg per 100 g of dry soil, CEC in
  # méq/100 g). Those references were set for cropland (and adapted for
  # grassland by the labs): "ok" spans their « conseillé » and « riche »
  # classes, "high" is their « très riche » class, where adding more is
  # useless. A lab's own thresholds win when its report gives some.
  #
  # Each field names the references its limits come from (`source`, keys of
  # SOURCES). Where no reference gives a limit, the field says so in `note`.
  module Interpretation
    SOURCES = {
      "genot_2009" => { label: "Genot et al. (2009), « L'état de fertilité des terres agricoles et forestières en région wallonne », BASE 13(1)",
                        url: "https://orbi.uliege.be/bitstream/2268/24741/1/%e2%80%a2%2007-56%20Genot%20.pdf" },
      "requasud_2012" => { label: "REQUASUD (Genot et al., 2012), Base de données sols, 3e synthèse",
                           url: "https://metawal.wallonie.be/geonetwork/srv/api/records/60ac65e7-5cc5-466c-95bb-cdb20814795e/attachments/brochure_sols_2012.pdf" },
      "michamps_2025" => { label: "Centre de Michamps (REQUASUD), « Interpréter son bulletin d'analyse de sol », V04, 2025",
                           url: "https://centredemichamps.be/wp-content/uploads/2025/05/EQ_Clients_Interpretation-Sols_V04.pdf" },
      "fourrages_mieux_2013" => { label: "Fourrages Mieux, CRA-W et Centre de Michamps (2013), synthèse des analyses de sols (échelles de pH et classes P, K, Mg)",
                                  url: "https://www.fourragesmieux.be/Documents_telechargeables/Synthese_des_analyses_de_sols_GAL_HSFA.pdf" },
      "spw_2020" => { label: "SPW, État de l'environnement wallon (2020), matière organique dans les sols agricoles : seuil de 2 % de carbone organique",
                      url: "https://etat.environnement.wallonie.be/files/indicateurs/SOLS/SOLS%202/Notice%20m%C3%A9thodologique_Mati%C3%A8re%20organique%20dans%20les%20sols%20agricoles_%C3%89dition%202020.pdf" },
      "grab_2008" => { label: "GRAB (Védie, 2008), « Fertilité chimique du sol : savoir interpréter les analyses », Maraîchage Bio Infos 56",
                       url: "https://abiodoc.docressources.fr/doc_num.php?explnum_id=466" }
    }.freeze

    PROVENANCE = "REQUASUD et Centre de Michamps (terres de culture et prairies wallonnes), SPW 2020 pour la matière organique".freeze

    # key => unit, valid range, and the band limits: below `low_below` is low,
    # above `high_above` is high, in between is ok. No `high_above`: never high.
    FIELDS = {
      # Michamps pH water scale: « acide » 5.2-5.9, « légèrement alcalin » from 7.4.
      "ph_water"           => { unit: nil,          range: 0..14,   low_below: 6.0, high_above: 7.5, source: %w[fourrages_mieux_2013] },
      # Optimum 5.5-6.0 under grassland, 6.5 under crops; < 5 Al toxicity, > 7 availability problems.
      "ph_kcl"             => { unit: nil,          range: 0..14,   low_below: 5.5, high_above: 7.0, source: %w[requasud_2012 genot_2009 michamps_2025] },
      # SPW threshold of 2 % organic carbon, × 1.72 (the factor of Walloon lab reports).
      "organic_matter_pct" => { unit: "%",          range: 0..100,  low_below: 3.4, high_above: 8.6, source: %w[spw_2020 fourrages_mieux_2013],
                                note: "high: no published upper limit; 5 % C × 1.72, an informative mark only" },
      "c_n_ratio"          => { unit: nil,          range: 1..100,  low_below: 8.0, high_above: 12.0, source: %w[michamps_2025 genot_2009] },
      # Classes « conseillé » 4.0-7.0, « riche » 7.1-10, « très riche » > 10.
      "p_mg_100g"          => { unit: "mg/100 g",   range: 0..1000, low_below: 4.0, high_above: 10.0, source: %w[fourrages_mieux_2013 michamps_2025 genot_2009] },
      # « conseillé » 15-21, « riche » 22-31, « très riche » > 31.
      "k_mg_100g"          => { unit: "mg/100 g",   range: 0..1000, low_below: 15.0, high_above: 31.0, source: %w[fourrages_mieux_2013 genot_2009] },
      # « conseillé » 6-10, « riche » 11-16, « très riche » > 16.
      "mg_mg_100g"         => { unit: "mg/100 g",   range: 0..1000, low_below: 6.0, high_above: 16.0, source: %w[fourrages_mieux_2013 genot_2009] },
      # « de 150 à plus de 3000 mg/100 g selon les sols »: no upper limit.
      "ca_mg_100g"         => { unit: "mg/100 g",   range: 0..5000, low_below: 150.0, source: %w[michamps_2025] },
      # Usual range 8 (sandy) to over 20 (clayey); ideal 12-20.
      "cec_meq_100g"       => { unit: "méq/100 g",  range: 0..150,  low_below: 8.0, high_above: 20.0, source: %w[grab_2008 michamps_2025] },
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
      elsif spec[:high_above] && value > spec[:high_above] then "high"
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
        { key:, value:, unit: FIELDS[key][:unit], band:, explanation: I18n.t("soil.interpretation.#{key}.#{band}"), sources: sources(key) }
      end
      { parameters:, texture: texture(results), provenance: PROVENANCE }
    end

    # [{ label:, url: }] behind a field's limits.
    def sources(key) = Array(FIELDS.dig(key, :source)).map { |k| SOURCES.fetch(k) }

    def texture(results)
      fractions = TextureClass.normalize(sand: results["sand_pct"], silt: results["silt_pct"], clay: results["clay_pct"]) or return nil
      key = TextureClass.classify(**fractions)
      { key:, name: TextureClass.label(key), description: TextureClass.description(key),
        sand: fractions[:sand].round(1), silt: fractions[:silt].round(1), clay: fractions[:clay].round(1) }
    end
  end
end
