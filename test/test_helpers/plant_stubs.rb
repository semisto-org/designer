# Minimal stand-ins for the plant catalogue models (PlantSpecies,
# PaletteItem), which belong to another feature area: the climate and
# finance code reads them through respond_to?, so plain structs will do.
module PlantStubs
  Species = Struct.new(:id, :latin_name, :common_name, :min_temperature_c, :hardiness_zone, :hardiness,
                       :max_hardiness_zone, :drought_tolerance, :soil_moisture, :watering_need,
                       :production_start_year, :maturity_years, keyword_init: true)
  PaletteItem = Struct.new(:id, :name, :common_name, :quantity, :status, :plant_species, keyword_init: true)

  def species(**attributes) = Species.new(**attributes)
  def palette_item(**attributes) = PaletteItem.new(**attributes)
end
