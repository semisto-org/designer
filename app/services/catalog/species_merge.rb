module Catalog
  # A catalogue reviewer folds a proposed species into the one the catalogue
  # already has (a typo, an outdated name, a duplicate): every map that uses
  # it moves to the target, nothing drawn is lost, and the proposed name
  # becomes a latin synonym of the target so the next person who types it
  # lands on the right species.
  class SpeciesMerge
    def initialize(source, target)
      raise ArgumentError, "same species" if source.id == target.id
      @source = source
      @target = target
    end

    def call
      PlantSpecies.transaction do
        varieties = move_varieties
        move_palette_items(varieties)
        move_patch_items(varieties)
        move_map_features(varieties)
        PlantObservation.where(species_id: @source.id).update_all(species_id: @target.id)
        PlantObservation.where(variety_id: varieties.keys).find_each { |o| o.update_columns(variety_id: varieties[o.variety_id]) }
        BioindicatorObservation.where(plant_species_id: @source.id).update_all(plant_species_id: @target.id)
        keep_name_as_synonym
        @source.reload.destroy!
      end
      @target
    end

    private
      # { source variety id => target variety id } for the varieties both
      # species have under the same name; the others simply move.
      def move_varieties
        @source.varieties.to_a.each_with_object({}) do |variety, same|
          twin = @target.varieties.find_by("lower(name) = ?", variety.name.downcase)
          if twin
            same[variety.id] = twin.id
          else
            variety.update_columns(species_id: @target.id)
          end
        end
      end

      def move_palette_items(varieties)
        PaletteItem.where(species_id: @source.id).find_each do |item|
          variety_id = varieties.fetch(item.variety_id, item.variety_id)
          if PaletteItem.where(map_id: item.map_id, species_id: @target.id, variety_id:).exists?
            item.destroy!
          else
            item.update_columns(species_id: @target.id, variety_id:)
          end
        end
      end

      def move_patch_items(varieties)
        PatchItem.where(species_id: @source.id).find_each do |item|
          variety_id = varieties.fetch(item.variety_id, item.variety_id)
          if PatchItem.where(map_feature_id: item.map_feature_id, species_id: @target.id, variety_id:).exists?
            item.destroy!
          else
            item.update_columns(species_id: @target.id, variety_id:)
          end
        end
      end

      def move_map_features(varieties)
        MapFeature.where("properties->>'species_id' = ?", @source.id.to_s).find_each do |feature|
          properties = feature.properties.merge("species_id" => @target.id)
          old_variety = Integer(properties["variety_id"].to_s, exception: false)
          properties["variety_id"] = varieties[old_variety] if old_variety && varieties.key?(old_variety)
          feature.update_columns(properties:)
        end
      end

      def keep_name_as_synonym
        synonyms = @target.common_names.select { |n| n.language == "la" }.map(&:name)
        names = (synonyms + [ @source.latin_name ] + @source.common_names.select { |n| n.language == "la" }.map(&:name))
                .uniq(&:downcase).reject { |n| n.casecmp?(@target.latin_name) }
        @target.replace_common_names!(names, language: "la") if names != synonyms
      end
  end
end
