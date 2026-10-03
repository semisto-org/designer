# Canonical botanical vocabulary of the catalogue: one stable key per notion,
# its French label (config/locales/plants.fr.yml, `plants.vocabulary.*`), and
# the aliases that let imports bring heterogeneous spellings back to it
# (`S`, « Soleil » and "full-sun" are all `sun`).
#
# Logic ported from Terranova's Plant::Vocabulary (normalize, canonical,
# canonical_month, canonical_zone, zone_for_temperature). The dynamic
# "variants in data" reading is gone: values are canonicalised once, at import,
# and the database only ever holds canonical keys.
module PlantVocabulary
  MONTH_KEYS = %w[jan feb mar apr may jun jul aug sep oct nov dec].freeze

  # The eight food-forest strata a plant plays in a design (palette strata).
  STRATA = %w[canopy sub_canopy shrub herbaceous ground_cover vine root aquatic].freeze

  # Facet => { multi:, values: { key => aliases } }. Aliases list only what the
  # normalisation below cannot deduce (French words, short codes, synonyms).
  FACETS = {
    plant_type: {
      multi: false,
      values: {
        "tree" => %w[arbre arbres],
        "shrub" => %w[arbuste arbustes],
        "small-shrub" => %w[arbrisseau arbrisseaux petit-arbuste smallshrub subshrub],
        "climber" => %w[grimpante grimpant liane vine],
        "herbaceous" => %w[herbacee herbacees herbace perennial-herb],
        "ground-cover" => %w[couvre-sol couvresol groundcover tapissant],
        "aquatic" => [ "plante aquatique", "aquatique" ]
      }
    },
    strata: {
      multi: false,
      values: {
        "canopy" => %w[canopee],
        "sub_canopy" => [ "tree", "arboree basse", "arbre bas", "low tree", "understory" ],
        "shrub" => %w[arbustive arbuste],
        "herbaceous" => %w[low herbacee],
        "ground_cover" => %w[couvre-sol],
        "vine" => %w[grimpante grimpantes climber liane],
        "root" => %w[subterranean rhizosphere racine],
        "aquatic" => %w[aquatique]
      }
    },
    foliage_type: {
      multi: false,
      values: {
        "deciduous" => %w[caduc caduque],
        "evergreen" => %w[persistant persistante],
        "semi-evergreen" => %w[semi-persistant semipersistant],
        "marcescent" => %w[marcescente]
      }
    },
    life_cycle: {
      multi: false,
      values: {
        "perennial" => %w[vivace vivaces perenne],
        "annual" => %w[annuel annuelle],
        "biennial" => %w[bisannuel bisannuelle biennale]
      }
    },
    growth_rate: {
      multi: false,
      values: {
        "slow" => %w[lente lent],
        "medium" => %w[moyenne moyen],
        "fast" => %w[rapide],
        "slow-start" => [ "lente au depart" ],
        "fast-start" => [ "rapide au depart" ]
      }
    },
    root_system: {
      multi: false,
      values: {
        "taproot" => %w[pivotante pivot],
        "fibrous" => %w[fasciculee],
        "spreading" => %w[tracante],
        "shallow" => %w[superficielle],
        "deep" => %w[profonde]
      }
    },
    fertility: {
      multi: false,
      values: {
        "self-fertile" => %w[autofertile auto-fertile],
        "partially-self-fertile" => [ "partiellement autofertile" ],
        "self-sterile" => [ "autosterile", "auto-sterile", "cross-pollination", "pollinisation croisee" ],
        "dioecious" => %w[dioique]
      }
    },
    exposures: {
      multi: true,
      values: {
        "sun" => %w[s soleil plein-soleil full-sun],
        "partial-shade" => [ "mo", "mi-ombre", "ombre legere", "light-shade", "semi-shade" ],
        "shade" => %w[o ombre full-shade]
      }
    },
    soil_moisture: {
      multi: true,
      values: {
        "dry" => [ "sec", "seche", "bien draine", "well-drained" ],
        "moist" => [ "frais", "fraiche" ],
        "wet" => %w[humide mouille tres-humide],
        "waterlogged" => %w[detrempe gorge-d-eau]
      }
    },
    soil_richness: {
      multi: false,
      values: {
        "poor" => %w[pauvre],
        "moderate" => %w[ordinaire moyen],
        "rich" => %w[riche fertile],
        "very-rich" => [ "tres riche" ]
      }
    },
    soil_types: {
      multi: true,
      values: {
        "loam" => %w[limoneux limon],
        "sandy" => %w[sableux sable sand],
        "clay" => %w[argileux argile],
        "chalky" => %w[calcaire chalk],
        "peaty" => %w[tourbeux tourbe],
        "stony" => %w[caillouteux pierreux]
      }
    },
    soil_ph: {
      multi: true,
      values: {
        "acidic" => %w[acid acide mildly-acid],
        "neutral" => %w[neutre],
        "alkaline" => %w[basic basique alcalin mildly-alkaline]
      }
    },
    edible_parts: {
      multi: true,
      values: {
        "fruit" => %w[fruits],
        "leaf" => [ "feuille", "jeunes feuilles", "leaves" ],
        "flower" => [ "fleur", "capitules", "chatons" ],
        "seed" => [ "graine", "grain", "nut", "noix" ],
        "root" => [ "racine", "tubercule", "rhizome", "bulb", "bulbe", "tuber" ],
        "shoot" => [ "pousse", "jeunes pousses", "stem", "tige" ],
        "sap" => %w[seve],
        "bark" => [ "ecorce", "inner-bark" ]
      }
    },
    eco_services: {
      multi: true,
      values: {
        "nitrogen" => [ "fixateur d azote", "nitrogen-fixer", "azote" ],
        "mellifere" => %w[melliflore nectarifere pollinator-support mellifera],
        "windbreak" => [ "brise-vent", "hedge", "haie" ],
        "ground-cover" => %w[couvre-sol weed-suppression],
        "beneficial-insects" => [ "auxiliaires", "insectes auxiliaires" ],
        "birds" => [ "oiseaux", "bird-habitat", "wildlife-habitat" ],
        "organic-matter" => [ "biomasse", "matiere organique", "chop-and-drop" ],
        "erosion-control" => [ "anti-erosion", "erosion" ],
        "minerals" => [ "mineraux", "accumulateur", "dynamic accumulator", "dynamic-accumulator" ],
        "light-shade" => [ "ombrage", "shade-provider" ],
        "pioneer" => [ "pioneer species", "espece pionniere", "pionnier", "pionniere" ],
        "cross-pollination" => [ "pollinisateur" ],
        "ornamental" => %w[ornemental decoratif]
      }
    },
    toxic_for: {
      multi: true,
      values: {
        "humans" => %w[humain humains people],
        "dogs" => %w[chien chiens],
        "cats" => %w[chat chats],
        "cattle" => %w[bovins vaches],
        "horses" => %w[chevaux cheval equides],
        "sheep" => %w[ovins moutons],
        "poultry" => %w[volailles poules]
      }
    }
  }.freeze

  module_function

  def keys(facet) = FACETS.fetch(facet.to_sym)[:values].keys

  def multi?(facet) = FACETS.fetch(facet.to_sym)[:multi]

  # « Ombre légère » → "ombre legere": no accents, no linking punctuation.
  def normalize(raw)
    return nil if raw.nil?
    utf8(raw).unicode_normalize(:nfd).gsub(/\p{Mn}/, "").downcase.strip.gsub(/[-_\s']+/, " ").squeeze(" ")
  end

  # Imported text may arrive as binary: read it as UTF-8, dropping bad bytes.
  def utf8(raw)
    text = raw.to_s
    text = text.dup.force_encoding(Encoding::UTF_8) unless text.encoding == Encoding::UTF_8
    text.valid_encoding? ? text : text.scrub("")
  end

  # Canonical key of a raw value for a facet, or nil when unknown.
  def canonical(facet, raw)
    norm = normalize(raw)
    return nil if norm.blank?
    singular = norm.sub(/s\z/, "")
    FACETS.fetch(facet.to_sym)[:values].each do |key, aliases|
      candidates = [ key, *aliases ].map { |a| normalize(a) }
      return key if candidates.include?(norm) || candidates.include?(singular)
    end
    nil
  end

  # Canonical keys of a list (or a comma-separated string), unknowns dropped.
  def canonical_list(facet, raw)
    values = raw.is_a?(String) ? raw.split(/[,;]/) : Array(raw)
    values.filter_map { |v| canonical(facet, v) }.uniq
  end

  MONTH_ALIASES = {
    "jan" => %w[janvier january], "feb" => %w[fev fevrier february],
    "mar" => %w[mars march], "apr" => %w[avr avril april],
    "may" => %w[mai], "jun" => %w[juin june],
    "jul" => %w[juil juillet july], "aug" => %w[aout august],
    "sep" => %w[sept septembre september], "oct" => %w[octobre october],
    "nov" => %w[novembre november], "dec" => %w[decembre december]
  }.freeze

  # `sep`, "Sep", "september", « Septembre », 9 and "9" are the same month: 9.
  def canonical_month(raw)
    return raw if raw.is_a?(Integer) && raw.between?(1, 12)
    norm = normalize(raw)
    return nil if norm.blank?
    if norm.match?(/\A\d{1,2}\z/)
      n = norm.to_i
      return n.between?(1, 12) ? n : nil
    end
    key = MONTH_KEYS.find { |k| k == norm } ||
      MONTH_ALIASES.find { |_k, aliases| aliases.any? { |a| normalize(a) == norm } }&.first ||
      MONTH_KEYS.find { |k| norm.start_with?(k) }
    key && MONTH_KEYS.index(key) + 1
  end

  def canonical_months(raw)
    values = raw.is_a?(String) ? raw.split(/[,;\s]+/) : Array(raw)
    values.filter_map { |m| canonical_month(m) }.uniq.sort
  end

  def month_key(number) = MONTH_KEYS[number.to_i - 1]

  # USDA zone from heterogeneous text: "zone-5", "USDA 6", "-15°C",
  # "-25/-30°C (USDA 4)". With temperatures, the lowest one decides.
  def canonical_zone(raw)
    return raw if raw.is_a?(Integer) && raw.between?(1, 13)
    norm = normalize(raw)
    return nil if norm.blank?
    if (m = norm.match(/(?:zone|usda)\s*(\d{1,2})/)) || (m = norm.match(/\A(\d{1,2})[ab]?\z/))
      z = m[1].to_i
      return z.between?(1, 13) ? z : nil
    end
    temperature = canonical_min_temperature(raw)
    temperature && zone_for_temperature(temperature)
  end

  # Lowest temperature written in the text (°C), or nil. The minus sign
  # carries the meaning here, so the raw text is read, not the normalised one.
  def canonical_min_temperature(raw)
    text = utf8(raw).unicode_normalize(:nfd).gsub(/\p{Mn}/, "").downcase.tr("−–", "--")
    temps = text.scan(/-\s*(\d{1,2}(?:[.,]\d)?)\s*°?\s*c/).flatten.map { |d| -d.tr(",", ".").to_f }
    temps.min
  end

  # USDA zone of an absolute minimum in °C: zone 2 starts at -45.6 °C and each
  # zone is 5.6 °C wide. -25 → 5, -20 → 6, -15 → 7, -10 → 8.
  def zone_for_temperature(celsius)
    (2 + ((celsius.to_f - -45.6) / 5.6).floor).clamp(1, 13)
  end

  # Lower bound of a zone (the coldest night it is rated for): 7 → -17.8 °C.
  def min_temperature_for_zone(zone)
    return nil if zone.nil?
    (-45.6 + (zone.to_i - 2) * 5.6).round(1)
  end
end
