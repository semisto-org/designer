# A plant placed on the land with the phone (« Planter »), read from the
# nursery label in front of the person: its species and, often, a cultivar
# by name. The plant joins the map's palette on the way, so the palette
# follows what goes into the ground even when nobody drew it first.
#
# `variety_name` names the cultivar as the label spells it: the catalogue's
# when it knows it, else a new one (as the Palette panel does). `size` is how
# the plant came from the nursery (« Racines nues », « En pot »…), kept on a
# palette line that this planting creates.
class FieldPlanting
  def initialize(map:, feature:, user:, variety_name: nil, size: nil)
    @map = map
    @feature = feature
    @user = user
    @variety_name = variety_name.to_s.squish.first(120).presence
    @size = size.to_s.squish.first(60).presence
  end

  # Saves the plant and its palette line together. False when the plant is
  # invalid (its errors say why); nothing changes then.
  def save
    MapFeature.transaction do
      apply_variety if species
      raise ActiveRecord::Rollback unless feature.save
      ensure_palette_item if species
      true
    end || false
  end

  private
    attr_reader :map, :feature, :user, :variety_name, :size

    def species
      return @species if defined?(@species)
      id = feature.plant_species_id if feature.kind == PlantableFeature::PLANT
      @species = id && PlantSpecies.visible_to(user).find_by(id:)
    end

    def apply_variety
      variety = variety_name ? PlantVariety.find_or_create_named!(species, variety_name) : species.varieties.find_by(id: feature.plant_variety_id)
      feature.properties = feature.properties.merge("variety_id" => variety&.id).compact
      @variety = variety
    end

    # The palette line of this species or cultivar: an AI's draft for it is
    # accepted, else a new line is added.
    def ensure_palette_item
      variety_id = @variety&.id
      return if map.palette_items.exists?(species_id: species.id, variety_id:)
      draft = map.palette_drafts.find_by(species_id: species.id, variety_id:, variety_name: nil)
      if draft
        draft.activate!
        draft.update!(size:) if size && draft.size.blank?
      else
        map.palette_items.create!(species:, variety_id:, size:, created_by: user)
      end
    end
end
