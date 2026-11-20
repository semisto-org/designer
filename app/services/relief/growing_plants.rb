module Relief
  # The map's plants as the 3D view grows them year after year: each plant
  # point and each patch line with its adult height and spread, the years it
  # takes to get there and when it went (or goes) into the ground. Sizes and
  # maturity follow PlantGrowth's cascade (variety, species, growth rate,
  # strata default) and say when they are only indicative. The growth curve
  # itself is drawn in the browser (relief/growth.ts).
  class GrowingPlants
    # A patch holds at most this many plants in 3D (a dense ground cover
    # would otherwise weigh more than the rest of the garden).
    PATCH_LIMIT = 600

    def initialize(map)
      @map = map
      @quantities = map.planted_quantities
    end

    def as_json(*)
      plants = plant_rows + existing_tree_rows
      patches = patch_rows
      dates = plants.filter_map { |p| p[:plantedOn] }
      {
        today: Date.current.iso8601,
        # Year 0: the first planting, or today when nothing is planted yet.
        origin: [ dates.min, Date.current.iso8601 ].compact.min,
        plants:, patches:
      }
    end

    private
      def plant_rows
        @map.features.in_design.where(kind: PlantableFeature::PLANT, status: "active").order(:id).filter_map do |feature|
          point = feature.geometry
          next unless point.respond_to?(:x)

          key = [ feature.plant_species_id, feature.plant_variety_id ]
          growth(key).merge(
            id: feature.id, lng: point.x.round(7), lat: point.y.round(7),
            number: feature.properties["number"].presence,
            ownName: feature.name.presence,
            training: feature.plant_training,
            # A support plant gives way to the productive ones: removed
            # `supportUntil` years after it was planted, when that is set.
            support: feature.support_plant?(@quantities.palette_role_for(key)),
            supportUntil: feature.support_until,
            graft: feature.plant_graft,
            # What someone measured on the tree itself (height, crown, girth, day).
            measures: feature.plant_measures,
            plantedOn: (feature.known_planted_on&.iso8601 rescue nil),
            # In the ground since an unknown date: grown already.
            plantedLongAgo: feature.planted_on_precision == "unknown"
          )
        end
      end

      # The trees already on the land (« Arbre existant »), alive and not
      # taken away: drawn at the size noted on them (height, crown), grown
      # already. Their species comes from the name typed on them when the
      # catalogue knows it; otherwise their crown says how tall a tree to draw.
      def existing_tree_rows
        trees = @map.features.in_design.where(kind: PlantPalette::EXISTING_KIND, status: "active").order(:id).to_a
                    .reject { |f| f.removed? || f.properties["health"] == "dead" || !f.geometry.respond_to?(:x) }
        ids = PlantSpecies.ids_for_names(trees.map { |f| f.properties["species"].to_s })
        trees.map do |feature|
          props = feature.properties
          species_id = ids[PlantSpecies.normalize_name(props["species"])]
          height = positive(props["height_m"])
          crown = positive(props["crown_diameter_m"])
          strata = species_id ? nil : existing_strata(height, crown)
          growth([ species_id, nil ], strata:).merge(
            id: feature.id, lng: feature.geometry.x.round(7), lat: feature.geometry.y.round(7),
            number: nil, ownName: feature.name.presence, existing: true,
            training: nil, support: false, supportUntil: nil, graft: nil,
            measures: (height || crown) ? { height:, crown:, girth: nil, on: nil } : nil,
            plantedOn: nil, plantedLongAgo: true
          )
        end
      end

      def positive(value)
        number = Float(value, exception: false)
        number if number&.positive?
      end

      # A tree the catalogue does not know: its strata from its size.
      def existing_strata(height, crown)
        size = [ height.to_f, crown.to_f ].max
        size >= 10 ? "canopy" : size >= 4 ? "sub_canopy" : "shrub"
      end

      def patch_rows
        @quantities.patches.filter_map do |patch|
          ring = patch.feature.geometry_geojson&.dig("coordinates", 0)
          next unless ring && patch.lines.any?

          total = patch.lines.sum(&:quantity)
          scale = total > PATCH_LIMIT ? PATCH_LIMIT.to_f / total : 1.0
          lines = patch.lines.map do |line|
            growth(line.item.key, strata: line.strata).merge(quantity: line.quantity, shown: (line.quantity * scale).round)
          end
          { id: patch.feature.id, name: patch.feature.name.presence, ring:, lines: }
        end
      end

      # Growth inputs of a species/cultivar on this map (its strata may be
      # the palette's), cached per key.
      def growth(key, strata: nil)
        @growth ||= {}
        @growth[[ key, strata ]] ||= begin
          species = @quantities.species_index[key.first] || (key.first && PlantSpecies.find_by(id: key.first))
          variety = key.last && (@quantities.variety_index[key.last] || PlantVariety.find_by(id: key.last))
          strata ||= (species && (@quantities.strata_for(key) || species.default_strata)) || "shrub"
          {
            speciesId: species&.id, varietyId: variety&.id, strata:,
            name: [ species&.common_name || species&.latin_name, variety && "'#{variety.name}'" ].compact.join(" ").presence,
            latinName: variety&.full_latin_name || species&.latin_name,
            foliage: species&.foliage_type, plantType: species&.plant_type,
            **PlantGrowth.inputs(strata:, species:, variety:)
          }
        end
      end
  end
end
