# Plants and patches drawn on a map are MapFeatures of the "plants" layer:
#   - kind "plant": a Point, properties { species_id, variety_id, planted_on,
#     training } (pollard | coppice, optional: how a tree or a bush is kept,
#     left free when absent);
#   - kind "patch": a Polygon whose composition lives in `patch_items`,
#     properties { exposure } (sun | partial-shade | shade, optional).
# A plant without species is allowed (drawn, never counted).
module PlantableFeature
  extend ActiveSupport::Concern

  PLANT = "plant"
  PATCH = "patch"
  # How a tree or a bush is kept when it is not left free: cut back to a head
  # on its trunk (« trogne ») or to the ground (« cépée »).
  TRAININGS = %w[pollard coppice].freeze

  included do
    has_many :patch_items, -> { order(:position, :id) }, inverse_of: :map_feature, dependent: :delete_all
    has_many :plant_observations, -> { order(:observed_on, :id) }, dependent: :destroy
    has_many :plant_harvests, -> { order(:noted_on, :id) }, dependent: :destroy

    before_validation :normalize_plant_properties, if: :plant?
    validate :validate_plant, if: :plant?
    validate :validate_patch, if: :patch?
  end

  # The latest date that is « today » somewhere: the gardener's browser may
  # already be tomorrow compared with the server (UTC).
  def self.latest_today = Date.current + 1

  def plant? = kind == PLANT
  def patch? = kind == PATCH

  def plant_species_id = integer_property("species_id")
  def plant_variety_id = integer_property("variety_id")

  def plant_training = properties["training"].presence

  def planted_on
    Date.iso8601(properties["planted_on"].to_s)
  rescue Date::Error
    nil
  end

  # In the ground: a plant without a planting date is still to plant.
  def planted? = planted_on.present?

  # Surface (m²) measured by PostGIS on the ellipsoid; nil for non-polygons.
  def area_m2
    return nil unless persisted?
    @area_m2 ||= measure_geometry["area"]
  end

  private
    def integer_property(key)
      value = properties[key]
      value.to_s.match?(/\A\d+\z/) ? value.to_i : nil
    end

    def normalize_plant_properties
      props = properties.dup
      %w[species_id variety_id].each do |key|
        value = props[key]
        if value.to_s.match?(/\A\d+\z/) then props[key] = value.to_i
        else props.delete(key)
        end
      end
      if props["planted_on"].present?
        props["planted_on"] = (Date.iso8601(props["planted_on"].to_s).iso8601 rescue props["planted_on"])
      else
        props.delete("planted_on")
      end
      # Free is the default: no key.
      props.delete("training") if props["training"].blank? || props["training"] == "free"
      self.properties = props
    end

    def validate_plant
      errors.add(:geometry, :invalid) if geometry && geometry.geometry_type != RGeo::Feature::Point
      species_id = plant_species_id
      if species_id && !PlantSpecies.exists?(species_id)
        errors.add(:properties, :invalid)
      elsif plant_variety_id && !PlantVariety.exists?(id: plant_variety_id, species_id:)
        errors.add(:properties, :invalid)
      end
      errors.add(:properties, :invalid) if plant_training && !TRAININGS.include?(plant_training)
      if properties["planted_on"].present?
        date = planted_on
        errors.add(:properties, :invalid) if date.nil? || date > PlantableFeature.latest_today
      end
    end

    def validate_patch
      if geometry && ![ RGeo::Feature::Polygon, RGeo::Feature::MultiPolygon ].include?(geometry.geometry_type)
        errors.add(:geometry, :invalid)
      end
      exposure = properties["exposure"]
      errors.add(:properties, :invalid) if exposure.present? && !PlantVocabulary.keys(:exposures).include?(exposure)
    end
end
