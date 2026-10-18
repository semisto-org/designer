# Anything drawn on a map. `layer` groups features the way designers think
# (what exists, then the WASPA design layers: water, access, structures,
# plants, animals), `kind` says what the element is.
class MapFeature < ApplicationRecord
  include GeoJsonGeometry
  include Commentable
  include PlantableFeature
  include GpsFix
  include MapFeature::Elements
  include MapFeature::Trash
  include MapFeature::Broadcasts
  include MapFeature::WaterSourceLink
  include MapFeature::Tags
  include MapFeature::PlantNumber
  include MapFeature::SoilDestination
  include MapFeature::WaterCapacity
  include MapFeature::InfiltrationTest
  include MapFeature::StormObservation

  LAYERS = %w[existing water access structures plants animals networks notes].freeze
  STATUSES = %w[active draft rejected].freeze
  SOURCES = %w[human ai].freeze

  belongs_to :map, touch: true
  belongs_to :created_by, class_name: "User", optional: true
  belongs_to :updated_by, class_name: "User", optional: true
  # Changes an AI proposed to this element; the accepted ones are its history.
  has_many :storage_readings, -> { order(:measured_on, :id) }, dependent: :delete_all
  has_many :update_drafts, class_name: "FeatureUpdateDraft", dependent: :delete_all
  has_many :task_features, dependent: :delete_all
  has_many :tasks, through: :task_features

  validates :kind, presence: true
  validates :layer, inclusion: { in: LAYERS }
  validates :status, inclusion: { in: STATUSES }
  validates :source, inclusion: { in: SOURCES }
  validates :geometry, presence: true

  scope :active, -> { where(status: "active") }
  scope :drafts, -> { where(status: "draft") }

  def geometry=(value)
    value = self.class.parse_geojson(value) unless value.nil? || value.is_a?(RGeo::Feature::Instance)
    super(value)
  end

  def comment_map = map
  def comment_title = name.presence || I18n.t("editor.kinds.#{kind}", default: kind.to_s.humanize)

  def as_geojson
    {
      type: "Feature",
      id:,
      geometry: geometry_geojson,
      properties: properties.merge(
        "id" => id, "layer" => layer, "kind" => kind, "name" => name, "notes" => notes,
        "status" => status, "source" => source, "rationale" => rationale,
        "style" => style, "tags" => tags, "lockVersion" => lock_version,
        "updatedAt" => updated_at&.iso8601
      )
    }
  end

  # { id => what the map calls each feature }: a plant by its number and
  # name (or species), any other element by its name or its kind. One query
  # for the species, whatever the number of features.
  def self.labels_for(features)
    species_ids = features.filter_map { |f| f.plant_species_id if f.plant? && f.name.blank? }.uniq
    species = species_ids.empty? ? {} : PlantSpecies.where(id: species_ids).includes(:common_names).index_by(&:id)
    features.to_h do |feature|
      name = feature.name.to_s.strip.presence
      if feature.plant?
        name ||= species[feature.plant_species_id]&.then { |s| s.common_name || s.latin_name }
        number = feature.plant_number
        label = [ number && !name.to_s.start_with?("n°") ? "n° #{number}" : nil, name ].compact.join(" — ")
      end
      [ feature.id, label.presence || name || I18n.t("editor.kinds.#{feature.kind}", default: feature.kind.humanize) ]
    end
  end
end
