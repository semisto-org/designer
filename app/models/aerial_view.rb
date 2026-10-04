# A dated aerial view of a map (« Vue drone »): an orthophoto taken by
# Semisto, offered in the map's base-map choice next to the public aerial
# photos. Everyone who can open the map sees it (viewers included).
#
# The tiles are NOT relayed by our server: the browser reads them straight
# from where Semisto hosts them, either
# - kind "xyz": a {z}/{x}/{y} raster template (e.g. gdal2tiles on a bucket);
# - kind "pmtiles": one .pmtiles raster archive, read by HTTP range requests
#   (the bucket must allow GET/HEAD with the Range header from the app's
#   origin, see docs/mise-en-production.md).
#
# A map keeps all its views, newest first (the history of views, to compare
# one season or one year with another). A view may deliver a drone order
# (PlanPurchase "drone"); its owner is then e-mailed once it is added.
class AerialView < ApplicationRecord
  KINDS = %w[xyz pmtiles].freeze
  MAX_ZOOM = 24
  PLACEHOLDERS = %w[{z} {x} {y}].freeze

  belongs_to :map
  belongs_to :plan_purchase, optional: true
  belongs_to :created_by, class_name: "User", optional: true

  normalizes :name, :attribution, with: ->(value) { value.to_s.squish.presence }
  normalizes :url, with: ->(value) { value.to_s.strip.presence }

  # « Vue drone » unless staff name it otherwise.
  before_validation { self.name = I18n.t("drone.default_name") if name.blank? }

  validates :name, presence: true, length: { maximum: 80 }
  validates :captured_on, presence: true
  validates :kind, inclusion: { in: KINDS }
  validates :url, presence: true, length: { maximum: 2048 }
  validates :attribution, length: { maximum: 300 }
  validates :min_zoom, :max_zoom, numericality: { only_integer: true, in: 0..MAX_ZOOM }, allow_nil: true
  validate :url_matches_kind
  validate :zoom_range_in_order
  validate :order_matches_map

  scope :newest_first, -> { order(captured_on: :desc, id: :desc) }

  after_create_commit :notify_owner, if: :plan_purchase_id?

  # Where the view comes from, for staff: "tiles.example.org".
  def host
    URI.parse(url_without_placeholders).host
  rescue URI::InvalidURIError
    nil
  end

  # What the map editor (and anyone who can see the map) receives.
  def as_inertia
    {
      id:, name:, capturedOn: captured_on.iso8601, kind:, url:, attribution:,
      minZoom: min_zoom, maxZoom: max_zoom
    }
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
      return if url.blank?
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
