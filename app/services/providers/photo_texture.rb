module Providers
  # The region's aerial photo under the 3D relief when the elevation
  # provider has none of its own (the Copernicus DEM, in Brussels or
  # Flanders): one GetMap of the region's default photo layer over the
  # grid's extent, in EPSG:3857 so the photo falls on the cells. Everything
  # else is the wrapped provider's.
  class PhotoTexture < SimpleDelegator
    class Error < StandardError; end

    # Regional WMS take ~15 s for 2048 px; that is ~25 cm per pixel over a
    # 500 m grid, finer than the relief itself.
    MAX_PX = 2048
    TIMEOUT = 90
    KINDS = %w[wms arcgis_rest].freeze

    def self.wrap(provider, region)
      return provider if provider.dataset?(:texture)

      layer = photo_layer(region)
      layer ? new(provider, layer) : provider
    end

    # The photo the map opens on, when it is one image per request (WMS or
    # ArcGIS export, not tiles) and a JPEG.
    def self.photo_layer(region)
      region.catalogue.find do |layer|
        layer.category == "base" && layer.option(:default) && KINDS.include?(layer.kind) &&
          layer.image_format == "image/jpeg" && GeoHttp.allowed?(layer.url)
      end
    end

    attr_reader :layer

    def initialize(provider, layer)
      super(provider)
      @layer = layer
    end

    def dataset?(name) = name.to_s == "texture" || __getobj__.dataset?(name)

    def dataset_label(name)
      name.to_s == "texture" ? "#{layer.name} (#{source})" : __getobj__.dataset_label(name)
    end

    def attribution = [ __getobj__.attribution, source ].compact_blank.join(" ; ")

    def texture(extent, max_px: MAX_PX)
      west, south, east, north = extent.mercator_bbox
      width_m, height_m = east - west, north - south
      width = [ max_px, (max_px * width_m / height_m).round ].min
      height = (width * height_m / width_m).round
      url = layer.upstream_image_url([ west, south, east, north ], width:, height:)
      image = GeoHttp.get(url, headers: { "Accept" => "image/*" }, timeout: TIMEOUT, breaker: false).body.to_s.b
      raise Error, "the photo is not a JPEG image" unless image.start_with?("\xFF\xD8".b)

      { bytes: image, width:, height: }
    end

    private
      def source = ActionController::Base.helpers.strip_tags(layer.attribution.to_s).squish.presence
  end
end
