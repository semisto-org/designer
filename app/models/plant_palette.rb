# The « Palette végétale » of a map: one row per species or cultivar that
# the project holds, whether it already grows there (existing trees kept),
# is chosen (palette), planned on the map, or planted. Each row carries the
# catalogue's facts, the palette's choices (role, price, supplier, size),
# the quantities (PlantedQuantities, the single addition) and the
# follow-up of planted plants, plus the same quantities per tag so the page
# can filter and group by tag without asking again.
#
#   PlantPalette.new(map).as_json[:rows].first
#   # => { key: "12-", speciesId: 12, name: "Pommier", planned: 3, planted: 1,
#   #      byTag: { "Chantier mars" => { planned: 2, … } }, … }
class PlantPalette
  # Existing trees name their species as free text (map_elements.yml): the
  # ones whose text is a catalogue name join that species' row; the others
  # get a row of their own, keyed by the text.
  EXISTING_KIND = "existing_tree"

  ExistingTree = Struct.new(:feature, :key, :label, keyword_init: true)

  attr_reader :map

  def initialize(map)
    @map = map
  end

  def quantities = @quantities ||= map.planted_quantities

  def as_json(*)
    { rows:, tags: tags, currency: "EUR" }
  end

  def rows
    @rows ||= keys.map { |key| row(key) }.compact
  end

  # The tags used by plants, patches and existing trees, one spelling each.
  def tags
    @tags ||= map.features.active.where(layer: "plants").or(map.features.active.where(kind: EXISTING_KIND))
                 .tag_counts.keys
  end

  # What the project knows of one species on this land, for the plant sheet
  # of the page: its plants, the patches that hold it, existing trees.
  def details(key)
    key = parse_key(key) or return nil
    latest = latest_observations
    features = plant_features.select { |f| plant_key(f) == key }
    {
      key: key_string(key),
      plants: features.map do |f|
        observation = latest[f.id]
        {
          id: f.id, name: f.name, tags: f.tags, plantedOn: f.properties["planted_on"].presence,
          inPatch: quantities.plants.find { |p| p.id == f.id }&.in_patch || false,
          survival: observation&.survival, vigor: observation&.vigor, observedOn: observation&.observed_on&.iso8601
        }
      end,
      patches: quantities.patches.filter_map do |patch|
        line = patch.lines.find { |l| l.item.key == key } or next
        { id: patch.feature.id, name: patch.feature.name, tags: patch.feature.tags, areaM2: patch.area_m2, quantity: line.quantity }
      end,
      existingTrees: existing_trees.select { |tree| tree.key == key }.map do |tree|
        props = tree.feature.properties
        { id: tree.feature.id, name: tree.feature.name, label: tree.label, tags: tree.feature.tags,
          heightM: props["height_m"], health: props["health"] }
      end
    }
  end

  private
    # [species_id, variety_id] for catalogue rows, [:existing, label] for
    # existing trees outside the catalogue.
    def keys
      planned = quantities.by_key.select { |_, slot| slot.planned.positive? || slot.placed.positive? }.keys
      (quantities.palette.map(&:key) + planned + existing_trees.map(&:key)).uniq
    end

    def key_string(key) = key.first == :existing ? "existing:#{key.last}" : "#{key.first}-#{key.last}"

    def parse_key(value)
      value = value.to_s
      return [ :existing, value.delete_prefix("existing:") ] if value.start_with?("existing:")
      species, variety = value.split("-", 2)
      return nil unless species.to_s.match?(/\A\d+\z/)
      [ species.to_i, variety.to_s.match?(/\A\d+\z/) ? variety.to_i : nil ]
    end

    def row(key)
      return existing_row(key) if key.first == :existing

      species = species_index[key.first] or return nil
      variety = key.last && quantities.variety_index[key.last]
      item = palette_index[key]
      slot = quantities.slot_for(key)
      strata = quantities.strata_for(key) || species.default_strata
      features = plant_features_by_key.fetch(key, [])
      {
        key: key_string(key), speciesId: species.id, varietyId: variety&.id, slug: species.to_param,
        paletteItemId: item&.id, inPalette: item.present?,
        name: variety ? (variety.common_name || "#{species.common_name || species.latin_name} '#{variety.name}'") : (species.common_name || species.latin_name),
        commonName: species.common_name, latinName: variety ? variety.full_latin_name : species.latin_name, varietyName: variety&.name,
        strata:, plantType: species.plant_type, role: item&.role, notes: item&.notes, targetCount: item&.target_count,
        unitPrice: item&.unit_price&.to_f, supplier: item&.supplier, size: item&.size,
        existing: existing_count(key), planned: slot.planned, isolated: slot.isolated, composed: slot.composed,
        placed: slot.placed, planted: slot.planted, patches: slot.patch_ids.size,
        heightM: species.adult_height(strata).metres, spreadM: species.adult_spread(strata).metres,
        maturityYears: PlantGrowth.maturity(strata:, species:, variety:).years,
        hardinessZone: species.hardiness_zone, exposures: species.exposures, edibleRating: species.edible_rating,
        floweringMonths: species.flowering_months, harvestMonths: species.harvest_months,
        native: country ? species.native_in?(country) : nil,
        fit: site.fit(species).as_json, excludedBy: site.excluded_by(species),
        photo: species.photo_json&.dig(:cardUrl),
        tags: row_tags(key, features),
        plantedFrom: features.filter_map { |f| f.properties["planted_on"].presence }.min,
        plantedTo: features.filter_map { |f| f.properties["planted_on"].presence }.max,
        survival: survival(features),
        byTag: by_tag(key), untagged: tag_slot(:untagged, key)
      }
    end

    def existing_row(key)
      trees = existing_trees.select { |tree| tree.key == key }
      {
        key: key_string(key), speciesId: nil, varietyId: nil, paletteItemId: nil, inPalette: false,
        name: trees.first.label, commonName: nil, latinName: nil, varietyName: nil,
        strata: "canopy", plantType: "tree", spreadM: tree_spread(trees), existing: trees.size, planned: 0, isolated: 0, composed: 0, placed: 0, planted: 0,
        patches: 0, exposures: [], floweringMonths: [], harvestMonths: [],
        tags: trees.flat_map { |tree| tree.feature.tags }.uniq(&:downcase),
        survival: { established: 0, struggling: 0, dead: 0 },
        byTag: by_tag(key), untagged: tag_slot(:untagged, key)
      }
    end

    def country = map.country_code

    # What the land tells, to judge each species on it (PlantFit).
    def site = @site ||= PlantFit::Site.new(map)

    # Mean crown of the existing trees as drawn, else a canopy tree's.
    def tree_spread(trees)
      crowns = trees.filter_map { |tree| tree.feature.properties["crown_diameter_m"].to_f.nonzero? }
      crowns.any? ? (crowns.sum / crowns.size).round(1) : PlantGrowth::SPREAD_BY_STRATA["canopy"]
    end

    def palette_index = @palette_index ||= quantities.palette.index_by(&:key)

    def species_index
      @species_index ||= PlantSpecies.where(id: quantities.species_index.keys | existing_trees.filter_map { |t| t.key.first if t.key.first != :existing })
                                     .includes(:common_names, :field_sources).with_photos.index_by(&:id)
    end

    # Active plant points with their tags and properties.
    def plant_features
      @plant_features ||= map.features.active.where(kind: "plant").select(:id, :name, :tags, :properties).order(:id).to_a
    end

    def plant_features_by_key = @plant_features_by_key ||= plant_features.group_by { |f| plant_key(f) }

    def plant_key(feature)
      species = feature.properties["species_id"].to_s
      variety = feature.properties["variety_id"].to_s
      return nil unless species.match?(/\A\d+\z/)
      [ species.to_i, variety.match?(/\A\d+\z/) ? variety.to_i : nil ]
    end

    def row_tags(key, features)
      from_patches = quantities.patches.select { |p| p.lines.any? { |l| l.item.key == key } }.flat_map { |p| p.feature.tags }
      from_trees = existing_trees.select { |t| t.key == key }.flat_map { |t| t.feature.tags }
      (features.flat_map(&:tags) + from_patches + from_trees).uniq(&:downcase)
    end

    def latest_observations
      @latest_observations ||= PlantObservation.latest_per_plant.where(map_id: map.id).index_by(&:map_feature_id)
    end

    def survival(features)
      states = features.filter_map { |f| latest_observations[f.id]&.survival }.tally
      { established: states.fetch("established", 0), struggling: states.fetch("struggling", 0), dead: states.fetch("dead", 0) }
    end

    # Existing trees kept and alive: what already grows on the land.
    def existing_trees
      @existing_trees ||= begin
        features = map.features.active.where(kind: EXISTING_KIND).order(:id).to_a
                      .reject { |f| f.properties["keep"] == false || f.properties["health"] == "dead" }
        matches = species_for_texts(features.map { |f| f.properties["species"].to_s })
        features.map do |f|
          text = f.properties["species"].to_s.squish
          species_id = matches[normalize(text)]
          label = text.presence || f.name.presence || I18n.t("plant_palette.existing_unnamed")
          ExistingTree.new(feature: f, key: species_id ? [ species_id, nil ] : [ :existing, label ], label:)
        end
      end
    end

    def existing_count(key) = existing_trees.count { |tree| tree.key == key }

    def normalize(text) = I18n.transliterate(text.to_s.squish).downcase

    # { normalized text => species id }, by latin name or French common name.
    def species_for_texts(texts)
      names = texts.map { |text| normalize(text) }.reject(&:blank?).uniq
      return {} if names.empty?
      found = PlantSpecies.where("lower(unaccent(latin_name)) IN (?)", names).pluck(:latin_name, :id)
      found += PlantCommonName.where(nameable_type: "PlantSpecies", language: "fr")
                              .where("lower(unaccent(name)) IN (?)", names).pluck(:name, :nameable_id)
      found.each_with_object({}) { |(name, id), index| index[normalize(name)] ||= id }
    end

    # Quantities per tag, as if the palette were filtered by it.
    def by_tag(key) = tags.to_h { |tag| [ tag, tag_slot(tag, key) ] }

    def tag_slot(tag, key)
      @tag_quantities ||= {}
      quantities_for_tag = @tag_quantities[tag] ||= map.planted_quantities(tag:)
      slot = key.first == :existing ? nil : quantities_for_tag.slot_for(key)
      trees = existing_trees.select { |tree| tree.key == key }
      existing = tag == :untagged ? trees.count { |t| t.feature.tags.empty? } : trees.count { |t| t.feature.tags.any? { |x| x.casecmp?(tag) } }
      {
        existing:, planned: slot&.planned || 0, planted: slot&.planted || 0, placed: slot&.placed || 0,
        patches: slot&.patch_ids&.size || 0
      }
    end
end
