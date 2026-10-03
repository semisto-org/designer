# A "carte": one terrain, its survey, its design and everything learned
# about it. Owned by one user (counts against their plan), shared with up to
# three editors and any number of viewers.
class Map < ApplicationRecord
  include GeoJsonGeometry

  MAX_EDITORS = 3
  STAGES = %w[observe map design plant].freeze

  belongs_to :owner, class_name: "User"
  belongs_to :organization, optional: true
  belongs_to :region
  has_many :memberships, class_name: "MapMembership", dependent: :destroy
  has_many :members, through: :memberships, source: :user
  has_many :invitations, class_name: "MapInvitation", dependent: :destroy
  has_many :features, class_name: "MapFeature", dependent: :destroy

  validates :name, presence: true
  validates :stage, inclusion: { in: STAGES }

  scope :active, -> { where(archived_at: nil) }

  after_create :add_owner_membership
  after_save :refresh_area, if: :saved_change_to_boundary?

  def role_for(user)
    return nil unless user
    return "owner" if owner_id == user.id
    return "editor" if organization_id && user.organization_memberships.exists?(organization_id:)
    memberships.find_by(user:)&.role
  end

  def viewable_by?(user) = role_for(user).present?
  def editable_by?(user) = %w[owner editor].include?(role_for(user))
  def manageable_by?(user) = role_for(user) == "owner"

  # After a plan ends, the owner's maps beyond the plan's limit stay readable
  # (view, export, comment) but cannot be edited: the oldest maps keep the
  # allowance, up to max_maps. Nothing is ever deleted. Never true while
  # billing is disabled (closed beta).
  def read_only_by_plan?
    return false unless Billing.enabled? && archived_at.nil?
    allowed = Entitlements.for(owner).max_maps
    owner.owned_maps.active.order(:created_at, :id).limit(allowed).pluck(:id).exclude?(id)
  end

  def editors_count
    memberships.where(role: "editor").count
  end

  def boundary=(value)
    value = self.class.parse_geojson(value) if value.is_a?(Hash) || value.is_a?(String) || value.respond_to?(:to_unsafe_h)
    value = GeoJsonGeometry::FACTORY.multi_polygon([ value ]) if value.respond_to?(:geometry_type) && value.geometry_type == RGeo::Feature::Polygon
    super(value)
  end

  def bbox
    return nil unless boundary
    box = RGeo::Cartesian::BoundingBox.create_from_geometry(boundary)
    [ box.min_x, box.min_y, box.max_x, box.max_y ]
  end

  def as_inertia(user = nil)
    {
      id:, name:, description:, address:, stage:, parcels:,
      areaM2: area_m2,
      boundary: geometry_geojson(:boundary),
      center: center && [ center.x, center.y ],
      zoom:, bbox:,
      region: region.as_inertia,
      role: role_for(user),
      ownerName: owner.display_name,
      updatedAt: updated_at.iso8601,
      lockVersion: lock_version
    }
  end

  private
    def add_owner_membership
      memberships.find_or_create_by!(user: owner) { |m| m.role = "owner" }
    end

    def refresh_area
      area = boundary && self.class.connection.select_value(
        "SELECT ST_Area(boundary::geography) FROM maps WHERE id = $1", "area", [ id ]
      )
      centroid = boundary && boundary.centroid
      update_columns(area_m2: area&.to_f&.round(1), center: centroid || center)
    end
end
