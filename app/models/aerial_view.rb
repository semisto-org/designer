# A dated aerial view of a map (« Vue drone »): an orthophoto taken by
# Semisto, offered in the map's base-map choice next to the public aerial
# photos. Everyone who can open the map sees it (viewers included).
#
# Two ways in:
# - staff paste an address (/admin/drone-views), and the browser reads the
#   tiles straight from where Semisto hosts them: kind "xyz", a {z}/{x}/{y}
#   raster template, or kind "pmtiles", one .pmtiles archive read by HTTP
#   range requests (see docs/deployment.md);
# - anyone editing the map imports a file (GeoTIFF from the drone software,
#   MBTiles or PMTiles), sent in parts (McpUpload); AerialViewImportJob turns
#   it into one PMTiles archive kept with the map's files (`archive`, read
#   through the app like any other file). Such a view has no url, and goes
#   uploading → processing → ready (or failed, with a `failure` code).
#
# A map keeps all its views, newest first (the history of views, to compare
# one season or one year with another). A view may deliver a drone order
# (PlanPurchase "drone"); its owner is then e-mailed once it is added.
class AerialView < ApplicationRecord
  KINDS = %w[xyz pmtiles].freeze
  MAX_ZOOM = 24
  PLACEHOLDERS = %w[{z} {x} {y}].freeze
  STATUSES = %w[uploading processing ready failed].freeze
  # What a person may import: a drone orthomosaic covers a few hectares in
  # a few hundred megabytes; this leaves room for a large estate at 3 cm.
  MAX_UPLOAD_BYTES = 10.gigabytes
  UPLOAD_EXTENSIONS = %w[.tif .tiff .mbtiles .pmtiles].freeze
  # Why an import stopped (drone.import.failures.* in the interface).
  FAILURES = %w[upload_incomplete upload_expired unsupported_format not_georeferenced not_raster empty source_unreachable conversion_failed].freeze

  belongs_to :map
  belongs_to :plan_purchase, optional: true
  belongs_to :created_by, class_name: "User", optional: true
  belongs_to :source_upload, class_name: "McpUpload", optional: true
  has_one_attached :archive

  normalizes :name, :attribution, with: ->(value) { value.to_s.squish.presence }
  normalizes :url, with: ->(value) { value.to_s.strip.presence }

  # « Vue drone » unless staff name it otherwise.
  before_validation { self.name = I18n.t("drone.default_name") if name.blank? }

  validates :name, presence: true, length: { maximum: 80 }
  validates :captured_on, presence: true
  validates :kind, inclusion: { in: KINDS }
  validates :status, inclusion: { in: STATUSES }
  validates :failure, inclusion: { in: FAILURES }, allow_nil: true
  validates :url, presence: true, unless: :imported?
  validates :url, length: { maximum: 2048 }
  validates :attribution, length: { maximum: 300 }
  validates :min_zoom, :max_zoom, numericality: { only_integer: true, in: 0..MAX_ZOOM }, allow_nil: true
  validate :url_matches_kind
  validate :zoom_range_in_order
  validate :order_matches_map

  scope :newest_first, -> { order(captured_on: :desc, id: :desc) }
  scope :ready, -> { where(status: "ready") }
  scope :in_progress, -> { where(status: %w[uploading processing]) }
  scope :imported, -> { where.not(source_filename: nil) }

  # Imported from a file on the map (as opposed to an address set by staff).
  def imported? = source_filename.present?

  def ready? = status == "ready"

  def in_progress? = %w[uploading processing].include?(status)

  # Stops an import, says why, and lets go of what was sent.
  def fail!(code)
    update!(status: "failed", failure: code)
    source_upload&.discard!
  end

  after_create_commit :notify_owner, if: :plan_purchase_id?

  # Where the view comes from, for staff: "tiles.example.org".
  def host
    URI.parse(url_without_placeholders).host
  rescue URI::InvalidURIError
    nil
  end

  # What the map editor (and anyone who can see the map) receives. An
  # imported view is read through `archive_url`, a route of the app that
  # checks who asks (the caller builds it: the map's or the public page's).
  def as_inertia(archive_url: nil)
    json = {
      id:, name:, capturedOn: captured_on.iso8601, kind:, url: imported? ? archive_url : url, attribution:,
      minZoom: min_zoom, maxZoom: max_zoom
    }
    return json unless imported?
    json.merge(status:, failure:, bounds:, filename: source_filename, byteSize: source_byte_size, createdBy: created_by&.display_name)
  end

  def as_admin_json
    as_inertia.merge(
      host:, mapId: map_id, mapName: map.name, ownerName: map.owner.display_name,
      planPurchaseId: plan_purchase_id, createdAt: created_at.iso8601, createdBy: created_by&.display_name
    )
  end

  private
    def url_without_placeholders
      PLACEHOLDERS.reduce(url.to_s) { |text, placeholder| text.gsub(placeholder, "0") }
    end

    # https only (the page is served over https, and the tiles go straight
    # to the browser), and the shape each kind needs.
    def url_matches_kind
      return if url.blank? || imported?
      uri = URI.parse(url_without_placeholders)
      return errors.add(:url, :not_https) unless uri.is_a?(URI::HTTPS) && uri.host.present? && uri.userinfo.nil?

      case kind
      when "xyz"
        errors.add(:url, :xyz_template) unless PLACEHOLDERS.all? { |placeholder| url.include?(placeholder) }
      when "pmtiles"
        errors.add(:url, :pmtiles_file) unless uri.path.to_s.downcase.end_with?(".pmtiles") && url.exclude?("{")
      end
    rescue URI::InvalidURIError
      errors.add(:url, :malformed)
    end

    def zoom_range_in_order
      return unless min_zoom && max_zoom && min_zoom > max_zoom
      errors.add(:max_zoom, :below_min_zoom)
    end

    # A view delivering a drone order goes on one of the buyer's maps.
    def order_matches_map
      return unless plan_purchase
      errors.add(:plan_purchase, :not_drone) unless plan_purchase.drone?
      errors.add(:map, :not_buyers) if map && plan_purchase.user_id != map.owner_id
    end

    def notify_owner
      DroneMailer.view_ready(self).deliver_later
    end
end
