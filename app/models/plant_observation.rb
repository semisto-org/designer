# Follow-up of a planted plant (a MapFeature of kind "plant"): did it take
# (établie, en difficulté, morte), how vigorous (1 to 5), a note and a photo.
# Observations of every garden feed the species sheet, as anonymous counts.
class PlantObservation < ApplicationRecord
  SURVIVALS = %w[established struggling dead].freeze
  # Same rules as the map's photos (MapPhoto): HEIC is refused.
  PHOTO_TYPES = MapPhoto::CONTENT_TYPES
  MAX_PHOTO_BYTES = MapPhoto::MAX_BYTES

  belongs_to :map_feature
  belongs_to :map
  belongs_to :species, class_name: "PlantSpecies", optional: true, inverse_of: :observations
  belongs_to :variety, class_name: "PlantVariety", optional: true
  belongs_to :user, optional: true

  # Served only as variants, metadata (GPS included) stripped, through
  # Maps::PlantObservationsController#photo, which checks the map's roles.
  has_one_attached :photo do |attachable|
    attachable.variant :thumb, resize_to_limit: [ 480, 480 ], format: :jpeg, saver: { strip: true, quality: 80 }
    attachable.variant :large, resize_to_limit: [ 1800, 1800 ], format: :jpeg, saver: { strip: true, quality: 85 }
  end

  validates :observed_on, presence: true
  validates :survival, inclusion: { in: SURVIVALS }
  validates :vigor, inclusion: { in: 1..5 }, allow_nil: true
  validates :note, length: { maximum: 2000 }
  validate :observes_a_plant
  validate :not_in_the_future
  validate :photo_is_an_image

  before_validation :copy_plant

  scope :chronological, -> { order(:observed_on, :id) }

  # Latest observation of each plant: the state a garden is in today.
  scope :latest_per_plant, -> {
    where(id: select("DISTINCT ON (map_feature_id) id").order(:map_feature_id, observed_on: :desc, id: :desc))
  }

  # Anonymous counts for a species sheet, from the latest observation of each
  # plant of every garden. Never names a map or a person.
  def self.stats_for(species)
    latest = latest_per_plant.where(species_id: species.id).where(map_id: Map.active.select(:id))
    counts = latest.group(:survival).count
    total = counts.values.sum
    return nil if total.zero?
    alive = counts.fetch("established", 0) + counts.fetch("struggling", 0)
    {
      plants: total, gardens: latest.distinct.count(:map_id),
      established: counts.fetch("established", 0), struggling: counts.fetch("struggling", 0), dead: counts.fetch("dead", 0),
      survivalRate: (alive * 100.0 / total).round, averageVigor: latest.where.not(vigor: nil).average(:vigor)&.to_f&.round(1)
    }
  end

  def as_json(*)
    {
      id:, featureId: map_feature_id, observedOn: observed_on.iso8601, survival:, vigor:, note:,
      author: user&.display_name,
      photoUrl: photo_path("large"),
      thumbUrl: photo_path("thumb"),
      createdAt: created_at&.iso8601
    }
  end

  private
    def photo_path(size)
      return nil unless photo.attached?
      Rails.application.routes.url_helpers.photo_map_feature_plant_observation_path(map_id, map_feature_id, id, size:)
    end

    def copy_plant
      return unless map_feature
      self.map_id = map_feature.map_id
      self.species_id ||= map_feature.plant_species_id
      self.variety_id ||= map_feature.plant_variety_id
    end

    def observes_a_plant
      errors.add(:map_feature, :invalid) unless map_feature&.kind == "plant"
    end

    def not_in_the_future
      errors.add(:observed_on, :in_future) if observed_on && observed_on > PlantableFeature.latest_today
    end

    def photo_is_an_image
      return unless photo.attached?
      errors.add(:photo, :content_type) unless PHOTO_TYPES.include?(photo.blob.content_type)
      errors.add(:photo, :too_large) if photo.blob.byte_size > MAX_PHOTO_BYTES
    end
end
