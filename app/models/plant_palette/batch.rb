# Several plants of the « Palette végétale » changed at once, from the
# selection of either table: species rows (keys « 12- », « 12-4 ») or plant
# points (ids). It sets the role or the strata of species (their palette
# item, created on the fly like PlantPalettesController#update_plant), puts
# plants in the ground or back to planned, or deletes: a species leaves the
# palette and its plant points go to the trash (MapFeature::Trash).
#
# Every run returns what it takes to undo it (`undo`), which `undo!` plays
# back: palette items as they were, planting dates as they were, trashed
# plants restored.
#
#   batch = PlantPalette::Batch.new(map, keys: [ "12-" ], change: "role", value: "food", by: user)
#   batch.run!   # => { changed: { species: 1, plants: 0 }, undo: { items: [ … ], plants: [], trashed: [] } }
class PlantPalette::Batch
  CHANGES = %w[role strata planted delete].freeze
  # « En terre » from the selection: today, or since a date nobody knows.
  PLANTED = %w[planned today unknown].freeze
  ITEM_FIELDS = %w[role strata notes target_count unit_price supplier size position status source rationale created_by_id].freeze

  class Invalid < StandardError; end

  attr_reader :map

  def initialize(map, keys: [], plant_ids: [], change: nil, value: nil, by: nil)
    @map = map
    @keys = Array(keys).filter_map { |key| parse_key(key) }.uniq
    @plant_ids = Array(plant_ids).map(&:to_i).uniq
    @change = change.to_s
    @value = value.presence
    @by = by
  end

  def run!
    raise Invalid, I18n.t("plant_palette.batch.errors.unknown_change") unless CHANGES.include?(@change)
    raise Invalid, I18n.t("plant_palette.batch.errors.empty") if @keys.empty? && @plant_ids.empty?

    undo = { items: [], plants: [], trashed: [] }
    PaletteItem.transaction do
      case @change
      when "role", "strata"
        validate_item_value!
        @keys.each do |key|
          item = map.palette_items.find_or_initialize_by(species_id: key.first, variety_id: key.last)
          next if !item.new_record? && item[@change] == @value
          undo[:items] << snapshot(item)
          item.created_by ||= @by
          item.update!(@change => @value)
        end
      when "planted"
        raise Invalid, I18n.t("plant_palette.batch.errors.invalid_value") unless PLANTED.include?(@value)
        plants.each do |plant|
          patch = planted_patch(plant) or next
          undo[:plants] << { id: plant.id, planted_on: plant.properties["planted_on"], planted_on_precision: plant.properties["planted_on_precision"] }
          plant.update!(properties: plant.properties.merge(patch), updated_by: @by)
        end
      when "delete"
        @keys.each do |key|
          item = map.palette_items.find_by(species_id: key.first, variety_id: key.last) or next
          undo[:items] << snapshot(item)
          item.destroy!
        end
        plants.each do |plant|
          plant.trash!(by: @by)
          undo[:trashed] << plant.id
        end
      end
    end
    { changed: { species: undo[:items].size, plants: undo[:plants].size + undo[:trashed].size }, undo: }
  rescue ActiveRecord::RecordInvalid => e
    raise Invalid, e.record.errors.full_messages.to_sentence
  end

  # Plays back what `run!` returned as `undo`.
  def undo!(undo)
    undo = undo.to_h.deep_stringify_keys
    PaletteItem.transaction do
      Array(undo["items"]).each do |snap|
        species_id, variety_id = snap.values_at("species_id", "variety_id")
        next unless species_id.to_s.match?(/\A\d+\z/)
        item = map.palette_items.find_by(species_id:, variety_id: variety_id.presence)
        if snap["present"]
          item ||= map.palette_items.new(species_id:, variety_id: variety_id.presence)
          item.update!(snap.slice(*ITEM_FIELDS))
        else
          item&.destroy!
        end
      end
      Array(undo["plants"]).each do |line|
        plant = map.features.find_by(id: line["id"], kind: "plant") or next
        plant.update!(properties: plant.properties.merge(line.slice("planted_on", "planted_on_precision")), updated_by: @by)
      end
      Array(undo["trashed"]).each do |id|
        map.features.trashed.find_by(id:, kind: "plant")&.restore!(by: @by)
      end
    end
  rescue ActiveRecord::RecordInvalid => e
    raise Invalid, e.record.errors.full_messages.to_sentence
  end

  private
    def parse_key(value)
      species, variety = value.to_s.split("-", 2)
      return nil unless species.to_s.match?(/\A\d+\z/)
      [ species.to_i, variety.to_s.match?(/\A\d+\z/) ? variety.to_i : nil ]
    end

    def validate_item_value!
      allowed = @change == "role" ? PaletteItem::ROLES : PaletteItem::STRATA
      raise Invalid, I18n.t("plant_palette.batch.errors.invalid_value") unless @value.nil? || allowed.include?(@value)
      unknown = @keys.map(&:first).uniq - PlantSpecies.where(id: @keys.map(&:first)).pluck(:id)
      raise Invalid, I18n.t("plant_palette.errors.not_in_catalogue") if unknown.any?
    end

    # The plant points chosen one by one, plus every plant of the chosen
    # species (a cultivar's row holds that cultivar's plants only).
    def plants
      @plants ||= begin
        scope = map.features.active.where(kind: "plant")
        chosen = @plant_ids.any? ? scope.where(id: @plant_ids).to_a : []
        of_species = @keys.any? ? scope.where("properties->>'species_id' IN (?)", @keys.map { |k| k.first.to_s }).to_a.select { |f| @keys.include?(plant_key(f)) } : []
        (chosen + of_species).uniq(&:id)
      end
    end

    def plant_key(feature)
      variety = feature.properties["variety_id"].to_s
      [ feature.properties["species_id"].to_i, variety.match?(/\A\d+\z/) ? variety.to_i : nil ]
    end

    # Plants already in the ground keep their date; « Prévu » clears it.
    def planted_patch(plant)
      planted = plant.properties["planted_on"].present?
      case @value
      when "planned" then { "planted_on" => nil, "planted_on_precision" => nil } if planted
      when "today" then { "planted_on" => Date.current.iso8601, "planted_on_precision" => nil } unless planted
      when "unknown" then { "planted_on" => Date.current.iso8601, "planted_on_precision" => "unknown" } unless planted
      end
    end

    def snapshot(item)
      base = { species_id: item.species_id, variety_id: item.variety_id, present: item.persisted? }
      item.persisted? ? base.merge(item.attributes.slice(*ITEM_FIELDS).transform_values { |v| v.is_a?(BigDecimal) ? v.to_s : v }.symbolize_keys) : base
    end
end
