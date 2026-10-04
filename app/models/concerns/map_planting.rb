# The planting side of a map: its palette, its patches' compositions, the
# follow-up of planted plants, and the readings built on them (plant list,
# quantities, coherence alerts). Other areas (nursery order, MCP) read
# `map.plant_list`.
module MapPlanting
  extend ActiveSupport::Concern

  included do
    has_many :palette_items, -> { order(:position, :id) }, inverse_of: :map, dependent: :delete_all
    has_many :patch_items, dependent: :delete_all
    has_many :plant_observations, dependent: :destroy
  end

  # Aggregated plants to buy and plant, by species and cultivar (PlantList).
  def plant_list = PlantList.new(planted_quantities)

  def planted_quantities = PlantedQuantities.for(self)

  def planting_alerts = PlantingAlerts.new(planted_quantities)

  # Hardiness of the site: the region's climate setting for now (a future
  # climate area can refine it per map).
  def hardiness_zone
    zone = region&.setting(:climate, :hardiness_zone)
    zone.present? ? zone.to_i : nil
  end

  def min_temperature_c
    temperature = region&.setting(:climate, :min_temperature_c)
    temperature.present? ? temperature.to_f : PlantVocabulary.min_temperature_for_zone(hardiness_zone)
  end

  def country_code = region&.country_code
end
