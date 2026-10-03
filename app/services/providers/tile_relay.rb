# The tile relay ("relais avec cache"): fetches one raster tile of a region
# layer from its upstream (WMS GetMap, ArcGIS export or XYZ), keeps it in
# Rails.cache, and refuses anything outside the layer's zoom range, the
# region's bounds or the host allow-list. The browser only ever names a
# layer key and z/x/y: the upstream URL always comes from the database.
module Providers
  class TileRelay
    class OutOfRange < StandardError; end

    Tile = Data.define(:body, :content_type)

    DEFAULT_TTL = 30.days
    MAX_BYTES = 4.megabytes

    def initialize(layer)
      @layer = layer
    end

    def fetch(z, x, y)
      z, x, y = Integer(z), Integer(x), Integer(y)
      raise OutOfRange unless servable?(z, x, y)

      GeoHttp.ensure_allowed!(@layer.url)
      cached = Rails.cache.fetch(cache_key(z, x, y), expires_in: ttl) { download(z, x, y) }
      Tile.new(body: cached["body"], content_type: cached["content_type"])
    end

    def cache_key(z, x, y)
      [ "map_data/tile", @layer.id, @layer.cache_version, z, x, y ].join("/")
    end

    private
      def servable?(z, x, y)
        return false unless @layer.raster? && TileMath.valid?(z, x, y)
        return false if @layer.min_zoom && z < @layer.min_zoom
        return false if @layer.max_zoom && z > @layer.max_zoom
        region_bbox.nil? || TileMath.intersects?(TileMath.bbox_lnglat(z, x, y), region_bbox)
      end

      def region_bbox
        return @region_bbox if defined?(@region_bbox)
        bounds = @layer.region.bounds
        @region_bbox = bounds && RGeo::Cartesian::BoundingBox.create_from_geometry(bounds)
          .then { |b| [ b.min_x, b.min_y, b.max_x, b.max_y ] }
      end

      def ttl
        days = @layer.option(:cache_days)
        days ? days.to_i.days : DEFAULT_TTL
      end

      # ArcGIS answers WMS errors with HTTP 200 and an XML body: only an
      # image counts as a tile.
      def download(z, x, y)
        response = GeoHttp.get(@layer.upstream_tile_url(z, x, y), headers: { "Accept" => "image/*" })
        type = response.headers["content-type"].to_s.split(";").first.to_s.strip
        body = response.body.to_s
        raise GeoHttp::Unavailable, "not an image (#{type})" unless type.start_with?("image/")
        raise GeoHttp::Unavailable, "tile too large" if body.bytesize > MAX_BYTES
        { "body" => body.b, "content_type" => type }
      end
  end
end
