# The public, read-only view of a map: what the owner chose to show, frozen
# at publication time (the snapshot), served without an account at
# /p/:token until unpublished. Publishing again takes a new snapshot at the
# same address.
class MapPublication < ApplicationRecord
  TOKEN_PATTERN = /[a-z0-9][a-z0-9-]{8,80}/

  belongs_to :map
  belongs_to :published_by, class_name: "User", optional: true
  # Who came through this view: the accounts it brought (users.source_publication_id)
  # and the trials started from it (« Et chez toi ? »).
  has_many :sourced_users, class_name: "User", foreign_key: :source_publication_id, inverse_of: :source_publication, dependent: :nullify
  has_many :trials, class_name: "MapTrial", foreign_key: :source_publication_id, inverse_of: :source_publication, dependent: :nullify

  # The link preview (og:image): the garden in year 15, painted in the
  # owner's browser after each publication (collab/preview.ts) and served at
  # /p/:token/preview.png. Terranova's own file: not counted in storage.
  has_one_attached :preview_image
  PREVIEW_MAX_BYTES = 4.megabytes

  validates :title, presence: true, length: { maximum: 120 }
  validates :description, length: { maximum: 2_000 }
  validates :token, presence: true, uniqueness: true, format: { with: /\A#{TOKEN_PATTERN}\z/ }

  before_validation { self.token ||= self.class.generate_token(title) }

  def self.generate_token(title)
    base = title.to_s.parameterize.first(32).sub(/-+\z/, "").presence || "carte"
    "#{base}-#{SecureRandom.alphanumeric(14).downcase}"
  end

  # Which layers a publication shows and which private things it hides.
  # Unknown keys are dropped; privacy flags default to hiding.
  def self.normalize_options(raw, map)
    raw = (raw.respond_to?(:to_unsafe_h) ? raw.to_unsafe_h : raw.to_h).stringify_keys
    flag = ->(key, default) { raw.key?(key) ? ActiveModel::Type::Boolean.new.cast(raw[key]) == true : default }
    {
      "feature_layers" => raw.key?("feature_layers") ? Array(raw["feature_layers"]).map(&:to_s) & MapFeature::LAYERS : MapFeature::LAYERS - %w[networks],
      "region_layers" => Array(raw["region_layers"]).map(&:to_s) & map.region.catalogue.enabled.pluck(:key),
      "hide_networks" => flag.call("hide_networks", true),
      "hide_address" => flag.call("hide_address", true),
      "show_notes" => flag.call("show_notes", false),
      # Zone and path names often carry the designer's own notes: off unless asked.
      "show_zone_names" => flag.call("show_zone_names", false),
      # What is still a project (buildings to come, plants not planted yet):
      # off, the map shows the land as it is today, unless the owner asks.
      "show_planned" => flag.call("show_planned", false),
      # The newest drone view (« Vues drone »), off unless the owner asks.
      "show_aerial_view" => flag.call("show_aerial_view", false),
      # The owner's consent to « Carnets ouverts » on the public site.
      "in_gallery" => flag.call("in_gallery", false)
    }
  end

  # Creates the publication or refreshes it (new snapshot, same address).
  def self.publish!(map, by:, title: nil, description: nil, options: nil)
    publication = map.publication || map.build_publication(version: 0)
    publication.title = title.presence || publication.title.presence || map.name
    publication.description = description unless description.nil?
    publication.options = normalize_options(options || publication.options.presence, map)
    publication.snapshot = Collab::PublicSnapshot.new(map, publication.options).build
    publication.version += 1
    publication.published_at = Time.current
    publication.unpublished_at = nil
    publication.published_by = by
    publication.save!
    # The old preview may show layers this snapshot no longer does.
    publication.preview_image.purge_later if publication.preview_image.attached?
    # Visitors of the 3D view should not wait on OpenStreetMap.
    BuildingsWarmJob.perform_later(map) if publication.relief?
    publication
  end

  def live? = unpublished_at.nil? && map.archived_at.nil?

  # « Carnets ouverts »: live publications whose owner offered them…
  scope :offered_to_gallery, -> {
    joins(:map).where(unpublished_at: nil, maps: { archived_at: nil }).where("map_publications.options ->> 'in_gallery' = 'true'")
  }
  # …and that Semisto chose to show, in its order.
  scope :in_gallery, -> { offered_to_gallery.where.not(gallery_position: nil).order(:gallery_position, :id) }

  # The map the features page visits: the one Semisto chose, else the first
  # of the gallery. Nil until a publication is in the gallery.
  def self.site_tour
    in_gallery.where(site_tour: true).first || in_gallery.first
  end

  def offered_to_gallery? = options["in_gallery"] == true

  # Semisto's choice: shown at the end of the gallery, or taken out of it.
  def choose_for_gallery!
    update!(gallery_position: (self.class.maximum(:gallery_position) || 0) + 1)
  end

  def remove_from_gallery!
    update!(gallery_position: nil, site_tour: false)
  end

  def choose_for_tour!
    transaction do
      self.class.where(site_tour: true).where.not(id:).update_all(site_tour: false)
      update!(site_tour: true, gallery_position: gallery_position || (self.class.maximum(:gallery_position) || 0) + 1)
    end
  end

  # A card of the gallery: the painted preview, the place in a few words and
  # how old the garden is. Built from the snapshot, like the public page.
  def as_gallery_card
    data = snapshot.fetch("map")
    growth = snapshot["growth"] || {}
    {
      token:, title:, path: public_path, previewPath: preview_path,
      regionName: data.dig("region", "name"), locality:, areaM2: data["area_m2"], boundary: data["boundary"],
      origin: growth["origin"], today: growth["today"],
      plants: Array(growth["plants"]).size + Array(growth["patches"]).sum { |patch| Array(patch["lines"]).sum { |line| line["quantity"].to_i } }
    }
  end

  def unpublish!
    update!(unpublished_at: Time.current)
  end

  # A fresh, unguessable address: the old one stops working at once.
  def renew_address!
    update!(token: self.class.generate_token(title))
  end

  # The map changed since the snapshot was taken.
  def stale?
    live? && map.updated_at > published_at
  end

  def features = snapshot.fetch("features", [])

  # Region layers to draw: those chosen at publication, still enabled, and
  # (defense in depth) never a sensitive one while networks are hidden.
  def region_layers
    layers = map.region.catalogue.enabled.where(key: snapshot.fetch("region_layer_keys", [])).to_a
    layers = layers.reject { |layer| Collab::PublicSnapshot.sensitive_region_layer?(layer) } if options["hide_networks"]
    layers
  end

  def region_layer(key) = region_layers.find { |layer| layer.key == key }

  # The drone view frozen at publication, while it still exists and the
  # owner still shows it.
  def aerial_view
    id = snapshot["aerial_view_id"]
    id && options["show_aerial_view"] ? map.aerial_views.ready.find_by(id:) : nil
  end

  def public_path = "/p/#{token}"

  # The link preview's address, versioned so that a new snapshot is fetched
  # again by the networks that cache images.
  def preview_path = preview_image.attached? ? "#{public_path}/preview.png?v=#{version}" : nil

  # The town of the published address (« 5530 Yvoir » → « Yvoir »), only when
  # the owner shows the address.
  def locality
    address = snapshot.dig("map", "address").to_s
    return nil if address.blank?
    address.split(",").last.to_s.sub(/\A\s*(?:[A-Z]{1,2}-?)?\d{4,5}\s*/, "").strip.presence
  end

  def as_inertia
    {
      title:, description:, version:, publishedAt: published_at.iso8601, token:, path: public_path,
      live: live?, stale: stale?, options:, previewPath: preview_path,
      # « 31 personnes ont regardé ton jardin, 2 ont commencé le leur ».
      views: views_count, gardensStarted: sourced_users.count
    }
  end

  # What the public page receives. Built from the snapshot only (plus the
  # region's layer catalogue): never from the live map.
  def as_public
    data = snapshot.fetch("map")
    {
      token:, title:, description:, version:, publishedAt: published_at.iso8601,
      map: {
        areaM2: data["area_m2"], stage: data["stage"], boundary: data["boundary"], center: data["center"],
        zoom: data["zoom"], bbox: data["bbox"], address: data["address"], parcels: data["parcels"],
        regionName: data.dig("region", "name"), locality:
      },
      growth: snapshot["growth"],
      features: { type: "FeatureCollection", features: features },
      layers: region_layers.map { |layer| public_layer(layer) },
      aerialView: aerial_view&.as_inertia(archive_url: "#{public_path}/aerial-view"),
      reliefPath: relief? ? "#{public_path}/3d" : nil
    }
  end

  # The simplified 3D view (rain, night, shade, a walk or a drive): when the
  # terrain's relief is imported and the map's plan includes the analyses.
  def relief?
    map.terrain&.ready? && Entitlements.for_map(map).analyses?
  end

  private
    def public_layer(layer)
      {
        key: layer.key, name: layer.name, group: layer.group_name, category: layer.category,
        attribution: layer.attribution, opacity: layer.opacity, legend: layer.legend, legendUrl: layer.legend_url,
        minZoom: layer.min_zoom, maxZoom: layer.max_zoom,
        tiles: "#{public_path}/tiles/#{layer.key}/{z}/{x}/{y}"
      }
    end
end
