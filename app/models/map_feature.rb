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
  include MapFeature::Functions
  include MapFeature::SeasonSign

  LAYERS = %w[existing water access structures plants animals networks notes].freeze
  STATUSES = %w[active draft rejected].freeze
  SOURCES = %w[human ai].freeze
  # Constructions with a roof: volumes in the 3D view; planned, never public.
  # Twin of BUILDING_KINDS in app/frontend/map/scenario.ts.
  BUILDING_KINDS = %w[building shed shelter greenhouse fruit_store poultry_house].freeze
  # What the « Existant » layer holds that can still be a project.
  PLANNABLE_EXISTING_KINDS = %w[building wall].freeze

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
  # Still a project: a plant not marked as planted, another element marked
  # « En projet ». Twin of isPlanned in app/frontend/map/scenario.ts.
  PLANNED_SQL = <<~SQL.squish.freeze
    (map_features.layer = 'plants' AND map_features.kind = 'plant'
      AND COALESCE(jsonb_typeof(map_features.properties -> 'planted_on'), '') <> 'string')
    OR (COALESCE(map_features.properties -> 'planned', 'false'::jsonb) = 'true'::jsonb
      AND NOT (map_features.layer = 'plants' AND map_features.kind = 'plant'))
  SQL
  REMOVED_SQL = "jsonb_typeof(map_features.properties -> 'removed_on') = 'string'".freeze
  TO_REMOVE_SQL = <<~SQL.squish.freeze
    COALESCE(map_features.properties -> 'to_remove', 'false'::jsonb) = 'true'::jsonb
    AND COALESCE(jsonb_typeof(map_features.properties -> 'removed_on'), '') <> 'string'
    AND map_features.layer <> 'notes' AND NOT (map_features.layer = 'plants' AND map_features.kind = 'plant')
  SQL
  scope :planned, -> { where(PLANNED_SQL) }
  # On the land today: neither a project nor taken away (`removed_on`).
  scope :on_the_ground, -> { where.not(PLANNED_SQL).where("COALESCE(jsonb_typeof(map_features.properties -> 'removed_on'), '') <> 'string'") }
  # There today, taken away by the project (« À retirer »). Twin of isToRemove.
  scope :to_remove, -> { where(TO_REMOVE_SQL).where.not(PLANNED_SQL) }
  scope :removed, -> { where(REMOVED_SQL) }

  # A rejected draft lets go of the photos it was proposed from, so they go
  # back to the photo library instead of pointing at a hidden element.
  after_update :release_photos, if: -> { saved_change_to_status?(to: "rejected") }

  def geometry=(value)
    value = self.class.parse_geojson(value) unless value.nil? || value.is_a?(RGeo::Feature::Instance)
    super(value)
  end

  # Whether it can be « En projet » (`planned: true`): not a note, not a
  # plant (it has its planting date), not what the « Existant » layer holds
  # by definition, except a building or a wall yet to be built. Twin of
  # canBePlanned in app/frontend/map/scenario.ts.
  def self.plannable?(layer, kind)
    return false if layer == "notes" || (layer == "plants" && kind == "plant")
    return PLANNABLE_EXISTING_KINDS.include?(kind) if layer == "existing"
    LAYERS.include?(layer)
  end

  # Still a project: a plant not planted yet, another element marked « En projet ».
  def planned? = plant? ? !planted? : properties.to_h["planned"] == true && self.class.plannable?(layer, kind)

  # Whether it can be « À retirer »: anything on the ground but a note or a
  # plant of the plan. Twin of canBeRemoved in app/frontend/map/scenario.ts.
  def self.removable?(layer, kind) = LAYERS.include?(layer) && layer != "notes" && !(layer == "plants" && kind == "plant")

  # Taken away (« Marquer comme retiré »): it no longer stands on the land.
  def removed? = properties.to_h["removed_on"].is_a?(String)

  def to_remove? = properties.to_h["to_remove"] == true && !removed? && !planned? && self.class.removable?(layer, kind)

  # A building, shed, greenhouse… not built yet: it never leaves in a public view.
  def planned_building? = BUILDING_KINDS.include?(kind) && planned?

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

  private
    def release_photos
      MapPhoto.where(map_feature_id: id).update_all(map_feature_id: nil, updated_at: Time.current)
    end
end
