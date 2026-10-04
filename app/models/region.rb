# A territory with its own data providers: map layers, cadastre, elevation,
# regulatory rules and native species. Wallonia, France and Luxembourg
# first, then Flanders and the Netherlands, without rewriting the app.
#
# The "europe" region is the base every other region inherits from
# (`parent`): pan-European layers and settings, coarse but available
# everywhere. A region keeps its parent's layers and replaces those it does
# better (same `key`), and a top-level setting (relief, climate…) of its own
# replaces the parent's whole entry. A map whose place falls in no region
# with an `outline` belongs to "europe".
class Region < ApplicationRecord
  EUROPE_KEY = "europe".freeze
  # A place this close to a region's outline but outside every outline
  # (coarse borders, coastline) still belongs to the nearest region.
  NEAR_OUTLINE_M = 1_000

  belongs_to :parent, class_name: "Region", optional: true
  has_many :children, class_name: "Region", foreign_key: :parent_id, inverse_of: :parent, dependent: :nullify
  has_many :layers, -> { order(:position, :id) }, class_name: "RegionLayer", dependent: :destroy
  has_many :maps, dependent: :restrict_with_error

  validates :key, :name, :country_code, presence: true
  validates :key, uniqueness: true
  validate :parent_is_not_self

  scope :active, -> { where(active: true) }

  def self.default
    active.find_by(key: "wallonia") || active.first
  end

  def self.europe
    active.find_by(key: EUROPE_KEY)
  end

  # The region a place belongs to: the smallest active region whose outline
  # covers it, else the nearest one within NEAR_OUTLINE_M, else "europe"
  # (else the default region, before "europe" is seeded).
  def self.for_point(lng, lat)
    lng, lat = Float(lng), Float(lat)
    point = sanitize_sql_array([ "ST_SetSRID(ST_MakePoint(?, ?), 4326)", lng, lat ])
    with_outline = active.where.not(outline: nil)
    with_outline.where("ST_Covers(outline, #{point})").order(Arel.sql("ST_Area(outline)")).first ||
      with_outline.where("ST_DWithin(outline::geography, #{point}::geography, ?)", NEAR_OUTLINE_M)
        .order(Arel.sql("ST_Distance(outline::geography, #{point}::geography)")).first ||
      europe || default
  rescue ArgumentError, TypeError
    europe || default
  end

  def europe? = key == EUROPE_KEY

  # A top-level setting comes whole from the region, or else from its parent.
  def setting(*path)
    first, *rest = path.map(&:to_s)
    value = settings.key?(first) ? settings[first] : parent&.setting(first)
    rest.empty? ? value : value.is_a?(Hash) ? value.dig(*rest) : nil
  end

  # The map catalogue: the region's own layers and its parent's, minus the
  # parent's layers the region replaces (same key). A relation, so callers
  # chain `enabled`, `bases`, `where(key:)`… as on `layers`.
  def catalogue
    return layers if parent_id.nil?
    own = RegionLayer.where(region_id: id)
    inherited = RegionLayer.where(region_id: parent_id).where.not(key: own.select(:key))
    own.or(inherited).order(:position, :id)
  end

  def as_inertia
    {
      id:, key:, name:,
      center: center && [ center.x, center.y ],
      bounds: bounds && RGeo::Cartesian::BoundingBox.create_from_geometry(bounds).then { |b| [ b.min_x, b.min_y, b.max_x, b.max_y ] },
      defaultZoom: default_zoom
    }
  end

  private
    def parent_is_not_self
      errors.add(:parent, :invalid) if parent_id.present? && parent_id == id
    end
end
