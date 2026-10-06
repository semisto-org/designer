# Anything drawn on a map. `layer` groups features the way designers think
# (what exists, then the WASPA design layers: water, access, structures,
# plants, animals), `kind` says what the element is.
class MapFeature < ApplicationRecord
  include GeoJsonGeometry
  include Commentable
  include PlantableFeature
  include GpsFix
  include MapFeature::Elements
  include MapFeature::Broadcasts
  include MapFeature::WaterSourceLink
  include MapFeature::Tags

  LAYERS = %w[existing water access structures plants animals networks notes].freeze
  STATUSES = %w[active draft rejected].freeze
  SOURCES = %w[human ai].freeze

  belongs_to :map, touch: true
  belongs_to :created_by, class_name: "User", optional: true
  belongs_to :updated_by, class_name: "User", optional: true

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
end
