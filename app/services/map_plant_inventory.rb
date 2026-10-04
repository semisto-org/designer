# The plants of a map, as one list of lines (one per palette item or per
# species), for the climate checks and the financial plan.
#
# When the plants area's single addition of a planting exists
# (PlantedQuantities: palette items, patch compositions and isolated plant
# points), its figures are used as they are, never recounted here. Without
# it, two simpler sources:
#
# - the palette (PaletteItem), with its planned quantity and species;
# - the plants placed on the map (active MapFeatures of layer "plants"),
#   counted per palette item or species they reference in their properties.
#
# The catalogue models live in another feature area and may evolve, so they
# are read defensively (`defined?`, `respond_to?`); without them, the
# inventory still counts placed plants by name.
class MapPlantInventory
  Line = Data.define(:key, :name, :latin_name, :quantity, :planned_quantity, :placed_count, :species, :palette_item_id, :species_id) do
    def display_name = name.presence || latin_name.presence || key
  end

  PALETTE_KEYS = %w[palette_item_id paletteItemId].freeze
  SPECIES_KEYS = %w[plant_species_id plantSpeciesId species_id speciesId].freeze
  NAME_KEYS = %w[species_name speciesName common_name commonName].freeze
  LATIN_KEYS = %w[latin_name latinName].freeze

  # palette: enumerable of palette items (defaults to the map's palette);
  # species_lookup: ->(ids) { { id => species } } for placed plants that
  # reference a species directly; quantities: a PlantedQuantities-like
  # object (palette, by_key, species_index, variety_index).
  def initialize(map, palette: nil, species_lookup: nil, quantities: nil)
    @map = map
    @palette = palette
    @species_lookup = species_lookup
    @quantities = quantities
  end

  def lines
    @lines ||= (planted = quantities) ? quantity_lines(planted) : palette_lines + loose_lines
  end

  def empty? = lines.empty?

  def total_quantity = lines.sum { _1.quantity.to_i }

  private
    def quantities
      return @quantities if @quantities || @palette || @quantities_tried
      @quantities_tried = true
      @quantities =
        if @map.respond_to?(:planted_quantities) then @map.planted_quantities
        elsif defined?(::PlantedQuantities) && ::PlantedQuantities.respond_to?(:for) then ::PlantedQuantities.for(@map)
        end
    rescue ActiveRecord::ActiveRecordError, NoMethodError => error
      Rails.logger.warn("[plants] planted quantities unavailable: #{error.class}")
      nil
    end

    # Palette items first (planned on the map, else the count aimed at),
    # then every other species or cultivar planned or placed on the map.
    def quantity_lines(planted)
      slots = read(planted, :by_key) || {}
      items = Array(read(planted, :palette))
      palette_keys = items.map { item_key(_1) }
      from_palette = items.map do |item|
        slot = slots[item_key(item)]
        planned = integer(read(slot, :planned)).to_i
        placed = integer(read(slot, :placed)).to_i
        target = integer(read(item, :target_count))
        species = read(item, :species)
        Line.new(
          key: "palette-#{read(item, :id)}",
          name: first_present(item, :display_name) || first_present(species, :common_name),
          latin_name: first_present(read(item, :variety), :full_latin_name) || first_present(species, :latin_name),
          quantity: [ planned.positive? ? planned : target.to_i, placed ].max,
          planned_quantity: planned.positive? ? planned : target,
          placed_count: placed,
          species:,
          palette_item_id: read(item, :id),
          species_id: read(item, :species_id) || read(species, :id)
        )
      end
      species_index = read(planted, :species_index) || {}
      variety_index = read(planted, :variety_index) || {}
      others = slots.filter_map do |key, slot|
        next if palette_keys.include?(key)
        species_id, variety_id = Array(key)
        planned = integer(read(slot, :planned)).to_i
        placed = integer(read(slot, :placed)).to_i
        next unless planned.positive? || placed.positive?
        species = species_index[species_id]
        variety = variety_id && variety_index[variety_id]
        Line.new(
          key: variety_id ? "variety-#{variety_id}" : "species-#{species_id}",
          name: first_present(variety, :common_name) || first_present(species, :common_name),
          latin_name: first_present(variety, :full_latin_name) || first_present(species, :latin_name),
          quantity: [ planned, placed ].max,
          planned_quantity: planned,
          placed_count: placed,
          species:,
          palette_item_id: nil,
          species_id:
        )
      end
      from_palette + others
    end

    def item_key(item)
      read(item, :key) || [ read(item, :species_id), read(item, :variety_id) ]
    end

    def palette
      @palette ||= begin
        if @map.respond_to?(:palette_items)
          @map.palette_items.to_a
        elsif defined?(::PaletteItem) && ::PaletteItem.respond_to?(:column_names) && ::PaletteItem.column_names.include?("map_id")
          ::PaletteItem.where(map_id: @map.id).to_a
        else
          []
        end
      end
    rescue ActiveRecord::ActiveRecordError => error
      Rails.logger.warn("[plants] palette unavailable: #{error.class}")
      []
    end

    def palette_lines
      palette.filter_map do |item|
        next if read(item, :status).to_s == "discarded"
        species = species_of(item)
        id = read(item, :id)
        placed = placed_by_palette_item[id.to_s].to_i
        planned = integer(read(item, :target_count) || read(item, :quantity))
        Line.new(
          key: "palette-#{id}",
          name: first_present(item, :common_name, :display_name, :name) || first_present(species, :common_name, :name_fr, :display_name),
          latin_name: first_present(species, :latin_name, :scientific_name) || first_present(item, :latin_name, :name),
          quantity: [ planned.to_i, placed ].max,
          planned_quantity: planned,
          placed_count: placed,
          species:,
          palette_item_id: id,
          species_id: read(item, :plant_species_id) || read(item, :species_id) || read(species, :id)
        )
      end
    end

    # Placed plants that are not linked to a palette item: grouped by the
    # species they reference, else by the name typed on the map.
    def loose_lines
      groups = loose_features.group_by { |feature| species_id_of(feature) || name_of(feature)&.downcase }
      groups.delete(nil)
      species = species_by_id(groups.keys.grep(Integer))
      groups.map do |group_key, features|
        species_record = group_key.is_a?(Integer) ? species[group_key] : nil
        first = features.first
        Line.new(
          key: group_key.is_a?(Integer) ? "species-#{group_key}" : "name-#{group_key.parameterize}",
          name: first_present(species_record, :common_name, :name_fr, :display_name) || name_of(first),
          latin_name: first_present(species_record, :latin_name, :scientific_name) || property(first, LATIN_KEYS),
          quantity: features.size,
          planned_quantity: nil,
          placed_count: features.size,
          species: species_record,
          palette_item_id: nil,
          species_id: group_key.is_a?(Integer) ? group_key : nil
        )
      end
    end

    def plant_features
      @plant_features ||= @map.features.where(layer: "plants", status: "active").to_a
    end

    def placed_by_palette_item
      @placed_by_palette_item ||= plant_features.filter_map { property(_1, PALETTE_KEYS)&.to_s }.tally
    end

    def loose_features
      palette_ids = palette.map { read(_1, :id).to_s }
      plant_features.reject { |feature| (id = property(feature, PALETTE_KEYS)) && palette_ids.include?(id.to_s) }
    end

    def species_id_of(feature) = integer(property(feature, SPECIES_KEYS))

    def name_of(feature) = feature.name.presence || property(feature, NAME_KEYS)

    def property(feature, keys)
      keys.lazy.map { feature.properties[_1] }.find(&:present?)
    end

    def species_of(item)
      %i[plant_species species].each do |association|
        value = read(item, association)
        return value if value
      end
      nil
    end

    def species_by_id(ids)
      return {} if ids.empty?
      return @species_lookup.call(ids) if @species_lookup
      return {} unless defined?(::PlantSpecies) && ::PlantSpecies.respond_to?(:where)
      ::PlantSpecies.where(id: ids).index_by(&:id)
    rescue ActiveRecord::ActiveRecordError
      {}
    end

    def read(object, attribute)
      object.respond_to?(attribute) ? object.public_send(attribute) : nil
    end

    def first_present(object, *attributes)
      return nil unless object
      attributes.lazy.map { read(object, _1) }.find(&:present?)&.to_s
    end

    def integer(value)
      value.present? ? Integer(value, exception: false) : nil
    end
end
