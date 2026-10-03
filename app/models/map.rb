# A "carte": one terrain, its survey, its design and everything learned
# about it. Owned by one user (counts against their plan), shared with up to
# three editors and any number of viewers.
class Map < ApplicationRecord
  include GeoJsonGeometry
  include Commentable

  # Raised when a fourth editor would be added.
  class EditorLimitReached < StandardError
    def initialize(message = nil)
      super(message || I18n.t("collab.sharing.errors.editor_limit", count: MAX_EDITORS))
    end
  end

  MAX_EDITORS = 3
  STAGES = %w[observe map design plant].freeze

  belongs_to :owner, class_name: "User"
  belongs_to :organization, optional: true
  belongs_to :region
  has_many :memberships, class_name: "MapMembership", dependent: :destroy
  has_many :members, through: :memberships, source: :user
  has_many :invitations, class_name: "MapInvitation", dependent: :destroy
  has_many :features, class_name: "MapFeature", dependent: :destroy
  has_one :share_link, class_name: "MapShareLink", dependent: :destroy
  has_one :publication, class_name: "MapPublication", dependent: :destroy
  # Every comment of the map, whatever it hangs on (`comments` is the map's own thread).
  has_many :discussion_comments, class_name: "Comment", dependent: :destroy
  has_many :service_requests, dependent: :destroy

  validates :name, presence: true
  validates :stage, inclusion: { in: STAGES }
  validate :project_matches_schema, if: :will_save_change_to_project?

  scope :active, -> { where(archived_at: nil) }

  after_create :add_owner_membership
  after_save :refresh_area, if: :saved_change_to_boundary?

  def role_for(user)
    return nil unless user
    return "owner" if owner_id == user.id
    return "editor" if organization_id && user.organization_memberships.exists?(organization_id:)
    memberships.find_by(user:)&.role || support_role_for(user)
  end

  # The project sheet, read leniently (invalid stored values are dropped).
  def project_sheet = ProjectSheet.parse(project, strict: false)

  def viewable_by?(user) = role_for(user).present?
  def editable_by?(user) = %w[owner editor].include?(role_for(user))
  def manageable_by?(user) = role_for(user) == "owner"

  def editors_count
    memberships.where(role: "editor").count
  end

  # Everyone who can open the map: members, plus the team's members when the
  # map belongs to an organization (they edit without taking an editor seat).
  def participants
    scope = User.where(id: memberships.select(:user_id))
    scope = scope.or(User.where(id: OrganizationMembership.where(organization_id:).select(:user_id))) if organization_id
    scope
  end

  # Seats held by editors, counting editor invitations still waiting to be
  # answered (so the owner cannot over-promise).
  def editor_seats_taken(except_invitation: nil)
    pending = invitations.pending.where(role: "editor")
    pending = pending.where.not(id: except_invitation.id) if except_invitation&.persisted?
    editors_count + pending.count
  end

  # Gives `user` the role through an invitation or a share link. Never
  # downgrades; raises EditorLimitReached when no editor seat is left.
  def grant_access!(user, role, invited_by: nil)
    current = role_for(user)
    return memberships.find_by(user:) if current == "owner" || current == "editor" || current == role

    membership = memberships.find_or_initialize_by(user:)
    if role == "editor" && editors_count >= MAX_EDITORS
      raise EditorLimitReached
    end
    membership.role = role
    membership.invited_by ||= invited_by
    membership.save!
    membership
  rescue ActiveRecord::RecordInvalid => e
    raise EditorLimitReached if e.record.is_a?(MapMembership) && e.record.errors.of_kind?(:role, :editor_limit)
    raise
  end

  def comment_map = self
  def comment_title = name

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
    # Semisto staff can read a map while a request sent from it is open: the
    # owner consented to that when sending it (see ServiceRequest).
    def support_role_for(user)
      "viewer" if user.admin? && service_requests.pending.where(contact_consent: true).exists?
    end

    def project_matches_schema
      sheet = ProjectSheet.parse(project)
      errors.add(:project, :invalid_sheet, fields: sheet.errors.keys.to_sentence) unless sheet.valid?
    end

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
