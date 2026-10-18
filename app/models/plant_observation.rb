# The journal of a planted plant (a MapFeature of kind "plant"): dated
# entries, never rewritten, each of one kind. A follow-up entry says whether
# it took (établie, en difficulté, morte); every entry may add how vigorous
# it is (1 to 5), a note and a photo. Flowering, pruning, damage, disease or
# an intervention are noted the same way; fruit seen and picked belong to the
# harvest log (PlantHarvest). The take of every garden feeds the species
# sheet, as anonymous counts.
class PlantObservation < ApplicationRecord
  include HeicAttachment
  include CountsTowardStorage

  SURVIVALS = %w[established struggling dead].freeze
  KINDS = %w[follow_up flowering pruning damage disease intervention other].freeze
  # Same rules as the map's photos (MapPhoto): HEIC is converted to JPEG.
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

  converts_heic :photo

  validates :observed_on, presence: true
  validates :kind, inclusion: { in: KINDS }
  validates :survival, inclusion: { in: SURVIVALS }, allow_nil: true
  validates :survival, presence: true, if: -> { kind == "follow_up" }
  validates :note, presence: true, if: -> { kind == "other" }
  validates :vigor, inclusion: { in: 1..5 }, allow_nil: true
  validates :note, length: { maximum: 2000 }
  validate :observes_a_plant
  validate :not_in_the_future
  validate :photo_is_an_image

  before_validation :copy_plant

  scope :chronological, -> { order(:observed_on, :id) }

  # Latest entry of each plant that says whether it took: the state a garden
  # is in today (a pruning note says nothing about it).
  scope :latest_per_plant, -> {
    where(id: where.not(survival: nil).select("DISTINCT ON (map_feature_id) id").order(:map_feature_id, observed_on: :desc, id: :desc))
  }

  # Anonymous counts for a species sheet, over every garden. A plant counts as
  # soon as it is in the ground (« planté », with a planting date) or has an
  # observation; survival and vigour come from the latest observation of the
  # plants that have one. Never names a map or a person. Nil when no garden
  # holds the species yet.
  def self.stats_for(species)
    maps = Map.active.select(:id)
    latest = latest_per_plant.where(species_id: species.id).where(map_id: maps)
    in_ground = in_ground_plants.where("map_features.properties->>'species_id' = ?", species.id.to_s)
    plants = in_ground.count
    return nil if plants.zero?

    counts = latest.group(:survival).count
    observed = counts.values.sum
    alive = counts.fetch("established", 0) + counts.fetch("struggling", 0)
    {
      plants:, gardens: in_ground.distinct.count(:map_id), observed:,
      established: counts.fetch("established", 0), struggling: counts.fetch("struggling", 0), dead: counts.fetch("dead", 0),
      survivalRate: observed.zero? ? nil : (alive * 100.0 / observed).round,
      averageVigor: latest.where.not(vigor: nil).average(:vigor)&.to_f&.round(1)
    }
  end

  # Plant points in the ground on every active map: planted (a planting
  # date) or observed at least once. The one definition of « en terre ».
  def self.in_ground_plants
    MapFeature.active.where(kind: PlantableFeature::PLANT, map_id: Map.active.select(:id))
              .where("map_features.properties->>'planted_on' IS NOT NULL OR map_features.id IN (?)",
                     PlantObservation.select(:map_feature_id))
  end

  # { species_id => plants in the ground } over every garden, for the
  # catalogue cards: anonymous, like the sheet's stats. Species without any
  # plant are absent.
  def self.in_ground_counts(species_ids)
    return {} if species_ids.empty?
    in_ground_plants.where("map_features.properties->>'species_id' IN (?)", species_ids.map(&:to_s))
                    .group(Arel.sql("map_features.properties->>'species_id'")).count
                    .transform_keys(&:to_i)
  end

  def as_json(*)
    {
      id:, featureId: map_feature_id, observedOn: observed_on.iso8601, kind:, survival:, vigor:, note:,
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
