# One entry of a region's map catalogue: a base map (plan, aerial photos)
# or a data overlay (soils, slopes, cadastre…), seeded per region
# (db/seeds/02_wallonia_layers.rb) and editable in the database.
#
# Kinds:
# - wms: an OGC WMS (GetMap in EPSG:3857, `layers` = WMS layer ids);
# - arcgis_rest: an ArcGIS MapServer `export` (`layers` = REST layer ids);
# - xyz: a {z}/{x}/{y} raster tile template;
# - style: a MapLibre style JSON (vector base map), always loaded directly.
#
# `proxied` layers go through our tile relay (Providers::TileRelay, cache +
# host allow-list); the others are loaded straight from the browser.
#
# `min_zoom` / `max_zoom` are MapLibre source zooms. Raster layers use
# 512 px tiles (`options.tile_size`), so a Leaflet "maxNativeZoom" N
# (256 px tiles) is N - 1 here. Beyond `max_zoom`, MapLibre upscales the
# last tile instead of asking for a blank one (the SPW hides some layers at
# large scales).
#
# `options` (jsonb):
# - identify: { layers: "1,2", formatter: "sols", tolerance: 3 } — what
#   `identify_url` (ArcGIS REST identify) is asked when the map is clicked;
# - role: "cadastre" marks the layer used to pick parcels;
# - format: image/png (default) or image/jpeg (photos);
# - tile_size: 512 (default for wms/arcgis_rest) or 256;
# - default: true on the base shown first;
# - fallback: { url:, attribution: } raster used when a style fails;
# - locked: true keeps manual database edits from being overwritten by seeds.
class RegionLayer < ApplicationRecord
  KINDS = %w[wms xyz arcgis_rest style].freeze
  CATEGORIES = %w[base overlay].freeze
  RASTER_KINDS = %w[wms xyz arcgis_rest].freeze

  belongs_to :region

  validates :key, :name, :url, presence: true
  validates :key, format: { with: /\A[a-z0-9][a-z0-9_]*\z/ }
  validates :kind, inclusion: { in: KINDS }
  validates :category, inclusion: { in: CATEGORIES }
  validates :key, uniqueness: { scope: :region_id }
  validates :opacity, numericality: { in: 0..1 }
  validate :style_is_not_proxied

  scope :enabled, -> { where(enabled: true) }
  scope :bases, -> { where(category: "base") }
  scope :overlays, -> { where(category: "overlay") }

  def identifiable?
    identify_url.present?
  end

  def base? = category == "base"
  def raster? = RASTER_KINDS.include?(kind)

  def option(*path)
    options.dig(*path.map(&:to_s))
  end

  def role = option(:role)
  def default? = option(:default) == true

  def identify_layers = option(:identify, :layers).presence || "all"
  def identify_formatter = option(:identify, :formatter).presence || key
  def identify_tolerance = (option(:identify, :tolerance) || 3).to_i

  def tile_size
    (option(:tile_size) || (kind == "xyz" ? 256 : 512)).to_i
  end

  def image_format
    option(:format).presence || "image/png"
  end

  # Busts the tile cache (server and browsers) when the layer changes.
  def cache_version
    updated_at.to_i
  end

  # The tile URL template the browser uses (MapLibre placeholders).
  def tile_url
    return url if kind == "style"
    return "/regions/#{region_id}/layers/#{key}/tiles/{z}/{x}/{y}?v=#{cache_version}" if proxied

    case kind
    when "wms" then with_query(wms_query(bbox: "{bbox-epsg-3857}"))
    when "arcgis_rest" then with_query(export_query(bbox: "{bbox-epsg-3857}"))
    else url
    end
  end

  # The upstream URL for one tile (used by the relay).
  def upstream_tile_url(z, x, y)
    case kind
    when "wms" then with_query(wms_query(bbox: Providers::TileMath.bbox_3857(z, x, y).join(",")))
    when "arcgis_rest" then with_query(export_query(bbox: Providers::TileMath.bbox_3857(z, x, y).join(",")))
    when "xyz" then url.gsub("{z}", z.to_s).gsub("{x}", x.to_s).gsub("{y}", y.to_s)
    end
  end

  def as_inertia
    {
      id:, key:, name:, group: group_name, category:, kind:,
      layers:, attribution:, opacity:, legendUrl: legend_url,
      minZoom: min_zoom, maxZoom: max_zoom, identifiable: identifiable?,
      proxied:, url: proxied ? nil : url, options:,
      description:, tileUrl: tile_url, tileSize: tile_size, version: cache_version, position:
    }
  end

  private
    # Some services carry a parameter in their base URL (SoilGrids: ?map=…).
    def with_query(query)
      "#{url}#{url.include?("?") ? "&" : "?"}#{query}"
    end

    def wms_query(bbox:)
      transparent = image_format == "image/png" ? "TRUE" : "FALSE"
      # BBOX stays last and unescaped: MapLibre substitutes the placeholder.
      { SERVICE: "WMS", VERSION: "1.3.0", REQUEST: "GetMap", LAYERS: layers.to_s, STYLES: "",
        FORMAT: image_format, TRANSPARENT: transparent, CRS: "EPSG:3857",
        WIDTH: tile_size, HEIGHT: tile_size }.to_query.then { |q| "#{q}&BBOX=#{bbox}" }
    end

    def export_query(bbox:)
      format = image_format == "image/jpeg" ? "jpg" : "png32"
      params = { f: "image", format:, transparent: format == "png32", bboxSR: 3857, imageSR: 3857,
                 size: "#{tile_size},#{tile_size}" }
      params[:layers] = "show:#{layers}" if layers.present?
      "#{params.to_query}&bbox=#{bbox}"
    end

    def style_is_not_proxied
      errors.add(:proxied, :invalid) if kind == "style" && proxied
    end
end
