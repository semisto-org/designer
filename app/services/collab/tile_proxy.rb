module Collab
  # Fetches one map tile of a region layer for the public view, so visitors
  # without an account never see (nor need) the provider's URL. Builds the
  # upstream request for each layer kind (xyz, WMS, ArcGIS REST) in Web
  # Mercator; returns nil when the provider is unreachable.
  class TileProxy
    Tile = Struct.new(:body, :content_type)

    ORIGIN = 20_037_508.342789244
    MAX_BYTES = 2.megabytes

    def initialize(layer)
      @layer = layer
    end

    def fetch(z, x, y)
      Rails.cache.fetch([ "public-tile", @layer.id, @layer.updated_at.to_i, z, x, y ], expires_in: 12.hours, skip_nil: true) do
        download(z, x, y)
      end
    end

    def upstream_url(z, x, y)
      case @layer.kind
      when "xyz" then xyz_url(z, x, y)
      when "wms" then wms_url(z, x, y)
      when "arcgis_rest" then arcgis_url(z, x, y)
      end
    end

    private
      def download(z, x, y)
        url = upstream_url(z, x, y) or return nil
        response = Faraday.new(request: { open_timeout: 4, timeout: 10 }) { |f| f.headers["User-Agent"] = "SemistoDesigner/1.0" }.get(url)
        type = response.headers["content-type"].to_s
        return nil unless response.success? && type.start_with?("image/") && response.body.present? && response.body.bytesize <= MAX_BYTES
        Tile.new(response.body, type.split(";").first)
      rescue Faraday::Error => e
        Rails.logger.warn("[public tiles] #{@layer.key} #{z}/#{x}/#{y}: #{e.class}")
        nil
      end

      def xyz_url(z, x, y)
        subdomain = Array(@layer.options["subdomains"]).first || "a"
        @layer.url.gsub("{z}", z.to_s).gsub("{x}", x.to_s).gsub("{y}", y.to_s).gsub("{s}", subdomain.to_s)
      end

      def wms_url(z, x, y)
        version = @layer.options["version"] || "1.3.0"
        params = {
          "SERVICE" => "WMS", "VERSION" => version, "REQUEST" => "GetMap",
          "LAYERS" => @layer.layers.to_s, "STYLES" => "",
          "FORMAT" => @layer.options["format"] || "image/png", "TRANSPARENT" => "true",
          (version.start_with?("1.3") ? "CRS" : "SRS") => "EPSG:3857",
          "WIDTH" => "256", "HEIGHT" => "256", "BBOX" => bbox(z, x, y).join(",")
        }
        with_query(@layer.url, params)
      end

      def arcgis_url(z, x, y)
        params = {
          "bbox" => bbox(z, x, y).join(","), "bboxSR" => "3857", "imageSR" => "3857", "size" => "256,256",
          "format" => "png32", "transparent" => "true", "f" => "image"
        }
        layers = @layer.layers.to_s
        params["layers"] = layers.start_with?("show:") ? layers : "show:#{layers}" if layers.present?
        with_query("#{@layer.url.chomp("/")}/export", params)
      end

      # [minx, miny, maxx, maxy] of a tile in EPSG:3857 meters.
      def bbox(z, x, y)
        size = 2 * ORIGIN / (2**z)
        min_x = -ORIGIN + x * size
        max_y = ORIGIN - y * size
        [ min_x, max_y - size, min_x + size, max_y ].map { |v| v.round(6) }
      end

      def with_query(base, params)
        uri = URI.parse(base)
        existing = URI.decode_www_form(uri.query.to_s).reject { |k, _| params.key?(k) || params.key?(k.upcase) }
        uri.query = URI.encode_www_form(existing + params.to_a)
        uri.to_s
      end
  end
end
