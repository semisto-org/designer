# « Territoire »: a commune read at its own scale, to decide where to act;
# the design itself happens later, sub-basin by sub-basin, on ordinary maps.
# It belongs to a team that Semisto granted the module to
# (Organization#territory_module?). Its dossier is a list of TerritoryItem
# (people already at work there, sources, expectations, dated markers,
# layout leads), read as the « carnet du territoire » (TerritoryNotebook).
#
# Readable by every member of its team, editable while the module is granted
# and the territory is not archived. An archived territory stays readable and
# no longer counts as an active one (billing is per active territory per year).
class Territory < ApplicationRecord
  include GeoJsonGeometry

  # A commune is 20 to 100 km² in Wallonia; the largest French ones reach a
  # few hundred. Beyond that it is no longer a commune.
  MAX_AREA_M2 = 800_000_000
  NAME_MAX_LENGTH = 120

  belongs_to :organization
  belongs_to :region, optional: true
  belongs_to :created_by, class_name: "User", optional: true
  has_many :items, class_name: "TerritoryItem", dependent: :delete_all

  normalizes :name, with: ->(n) { n.to_s.squish }
  validates :name, presence: true, length: { maximum: NAME_MAX_LENGTH }
  validates :boundary, presence: true
  validate :area_within_limit

  before_validation :derive_from_boundary, if: -> { boundary.present? && (will_save_change_to_boundary? || center.nil?) }

  scope :active, -> { where(archived_at: nil) }
  scope :archived, -> { where.not(archived_at: nil) }
  # The territories of the teams `user` belongs to.
  scope :visible_to, ->(user) { where(organization_id: OrganizationMembership.where(user:).select(:organization_id)) }

  def boundary=(value)
    value = self.class.parse_geojson(value) if value.is_a?(Hash) || value.is_a?(String) || value.respond_to?(:to_unsafe_h)
    value = GeoJsonGeometry::FACTORY.multi_polygon([ value ]) if value.respond_to?(:geometry_type) && value.geometry_type == RGeo::Feature::Polygon
    super(value)
  end

  def archived? = archived_at.present?
  def archive! = update!(archived_at: Time.current)
  def unarchive! = update!(archived_at: nil)

  def viewable_by?(user) = user.present? && organization.member?(user)
  def editable_by?(user) = viewable_by?(user) && organization.territory_module? && !archived?

  def bbox
    box = RGeo::Cartesian::BoundingBox.create_from_geometry(boundary)
    [ box.min_x, box.min_y, box.max_x, box.max_y ]
  end

  # The team's maps whose place lies in the territory. Other people's maps
  # will join only with their owner's consent (not built yet).
  def team_maps
    organization.maps.where.not(boundary: nil)
                .where("ST_Intersects(maps.boundary, ST_GeomFromEWKT(?))", "SRID=4326;#{boundary.as_text}")
                .order(:name)
  end

  # The region's layers that can be read here; the sensitive ones (networks)
  # never leave the server.
  def readable_layers
    return [] unless region
    region.catalogue.enabled.reject { |layer| Collab::PublicSnapshot.sensitive_region_layer?(layer) }
  end

  # What the person's AI should look for on this territory, region by
  # region (settings `territory.research_grid`, inherited from europe).
  def research_grid
    Array(region&.setting("territory", "research_grid"))
  end

  def notebook_text(key) = notebook.is_a?(Hash) ? notebook[key.to_s].to_s : ""

  def counts
    items.where.not(status: "rejected").group(:kind, :status).count.each_with_object({}) do |((kind, status), n), acc|
      acc[kind] ||= { "active" => 0, "draft" => 0 }
      acc[kind][status] = n
    end
  end

  def as_inertia
    {
      id:, name:, areaM2: area_m2.round, bbox:,
      boundary: geometry_geojson(:boundary),
      center: [ center.x, center.y ],
      teamId: organization_id, teamName: organization.name,
      region: region&.as_inertia,
      boundarySource: boundary_source,
      notebook: { intro: notebook_text(:intro), nextStep: notebook_text(:next_step), nextStepBudget: notebook_text(:next_step_budget) },
      archived: archived?,
      createdAt: created_at.iso8601, updatedAt: updated_at.iso8601
    }
  end

  private
    def derive_from_boundary
      self.center = boundary.point_on_surface
      sql = self.class.sanitize_sql_array([ "SELECT ST_Area(ST_GeomFromEWKT(?)::geography)", "SRID=4326;#{boundary.as_text}" ])
      self.area_m2 = self.class.connection.select_value(sql).to_f
      self.region ||= Region.for_point(center.x, center.y)
    end

    def area_within_limit
      return unless area_m2
      errors.add(:boundary, :too_large) if area_m2 > MAX_AREA_M2
      errors.add(:boundary, :empty) if area_m2 <= 0
    end
end
