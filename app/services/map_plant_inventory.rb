# The plants of a map, as one list of lines (one per palette item or per
# species), for the climate checks and the financial plan. Two sources:
#
# - the palette (PaletteItem, owned by the plants area), with its planned
#   quantity and its catalogue species;
# - the plants placed on the map (MapFeature, layer "plants"), counted per
#   palette item or species they reference in their properties.
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
  # reference a species directly.
  def initialize(map, palette: nil, species_lookup: nil)
    @map = map
    @palette = palette
    @species_lookup = species_lookup
  end

  def lines
    @lines ||= palette_lines + loose_lines
  end

  def empty? = lines.empty?

  def total_quantity = lines.sum { _1.quantity.to_i }

  private
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
        planned = integer(read(item, :quantity))
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
      @plant_features ||= @map.features.where(layer: "plants").where.not(status: "rejected").to_a
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
