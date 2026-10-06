# The planting side of a map: its palette, its patches' compositions, the
# follow-up of planted plants, and the readings built on them (plant list,
# quantities, coherence alerts). Other areas (nursery order, MCP) read
# `map.plant_list`.
module MapPlanting
  extend ActiveSupport::Concern

  included do
    # The palette is what humans chose or accepted; an AI's proposals wait
    # apart as drafts until someone accepts or refuses them.
    has_many :palette_items, -> { active.order(:position, :id) }, inverse_of: :map, dependent: :delete_all
    has_many :palette_drafts, -> { drafts.order(:position, :id) }, class_name: "PaletteItem", dependent: :delete_all
    has_many :patch_items, dependent: :delete_all
    has_many :plant_observations, dependent: :destroy
  end

  # Aggregated plants to buy and plant, by species and cultivar (PlantList).
  # `tag` narrows it to the plants and patches carrying that tag (or
  # `:untagged`), see PlantedQuantities.for.
  def plant_list(tag: nil) = PlantList.new(planted_quantities(tag:))

  def planted_quantities(tag: nil) = PlantedQuantities.for(self, tag:)

  def planting_alerts = PlantingAlerts.new(planted_quantities)

  # Hardiness of the site: the climate normals at the map's location (USDA
  # zone of the coldest night of the year), else the region's setting.
  def hardiness_zone
    site_climate&.dig(:zone, :number) || region&.setting(:climate, :hardiness_zone).presence&.to_i
  end

  def min_temperature_c
    site_climate&.dig(:normals, :extreme_min_c)&.to_f ||
      region&.setting(:climate, :min_temperature_c).presence&.to_f ||
      PlantVocabulary.min_temperature_for_zone(hardiness_zone)
  end

  def country_code = region&.country_code

  private
    def site_climate
      return @site_climate if defined?(@site_climate)
      point = center || boundary&.centroid
      result = point && Providers::Climate.for(region).current_normals(point)
      @site_climate = result&.available? ? result.data.deep_symbolize_keys : nil
    rescue StandardError => error
      Rails.logger.warn("[plants] site climate unavailable: #{error.class}: #{error.message}")
      @site_climate = nil
    end
end
