module PhotoArchive
  # One image of a photo layer over a box in EPSG:3857 [west, south, east,
  # north]: a single GetMap or ArcGIS export for one-image services, the
  # tiles stitched together for tiled ones (XYZ / WMTS). Returns JPEG bytes,
  # or raises Providers::GeoHttp::Unavailable.
  class Snapshot
    TIMEOUT = 30
    MAX_TILES = 36

    def self.call(layer, bbox, width:, height:) = new(layer, bbox, width:, height:).call

    def initialize(layer, bbox, width:, height:)
      @layer, @bbox, @width, @height = layer, bbox, width.to_i, height.to_i
    end

    def call
      Providers::GeoHttp.ensure_allowed!(@layer.url)
      image = @layer.kind == "xyz" ? stitched : single
      image = image.flatten(background: [ 255, 255, 255 ]) if image.has_alpha?
      image.jpegsave_buffer(Q: 85, strip: true)
    end

    # The raw image, alpha kept: Coverage reads it to tell a blank answer.
    def image = @layer.kind == "xyz" ? stitched : single

    private
      def single
        url = @layer.upstream_image_url(@bbox, width: @width, height: @height) or raise Providers::GeoHttp::Unavailable, "no image URL"
        Vips::Image.new_from_buffer(fetch(url), "")
      end

      # The zoom whose tiles are at least as fine as the asked size, the
      # tiles covering the box, joined then cropped to it.
      def stitched
        west, south, east, north = @bbox
        span = 2 * Providers::TileMath::ORIGIN
        size = @layer.tile_size
        zoom = Math.log2(span * @width / ((east - west) * size)).ceil.clamp(0, @layer.max_zoom || 19)
        tiles = 2**zoom
        tile_of = ->(x) { ((x + Providers::TileMath::ORIGIN) / span * tiles).floor.clamp(0, tiles - 1) }
        row_of = ->(y) { ((Providers::TileMath::ORIGIN - y) / span * tiles).floor.clamp(0, tiles - 1) }
        x0, x1 = tile_of.(west), tile_of.(east)
        y0, y1 = row_of.(north), row_of.(south)
        raise Providers::GeoHttp::Unavailable, "too many tiles" if (x1 - x0 + 1) * (y1 - y0 + 1) > MAX_TILES

        rows = (y0..y1).map do |y|
          (x0..x1).map { |x| tile(zoom, x, y, size) }
        end
        mosaic = Vips::Image.arrayjoin(rows.flatten, across: x1 - x0 + 1)
        tile_m = span / tiles
        left = ((west - (-Providers::TileMath::ORIGIN + (x0 * tile_m))) / tile_m * size).round
        top = (((Providers::TileMath::ORIGIN - (y0 * tile_m)) - north) / tile_m * size).round
        w = ((east - west) / tile_m * size).round.clamp(1, mosaic.width - left)
        h = ((north - south) / tile_m * size).round.clamp(1, mosaic.height - top)
        mosaic.crop(left, top, w, h).resize(@width.to_f / w, vscale: @height.to_f / h)
      end

      def tile(zoom, x, y, size)
        image = Vips::Image.new_from_buffer(fetch(@layer.upstream_tile_url(zoom, x, y)), "")
        image = image.colourspace(:srgb) if image.bands < 3
        image = image.bandjoin(255) unless image.has_alpha?
        image
      rescue Providers::GeoHttp::Unavailable, Vips::Error
        # A missing tile (outside the flight) stays transparent.
        Vips::Image.black(size, size, bands: 4).copy(interpretation: :srgb)
      end

      def fetch(url)
        Providers::GeoHttp.get(url, headers: { "Accept" => "image/*" }, timeout: TIMEOUT).body.to_s.b
      end
  end
end
