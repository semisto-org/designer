# Ported from Claudy (MIT, © 2022-2023 Fondation Les 4 Sources)
module Providers
  # Elevation, surface model and land cover sampled from ArcGIS REST
  # MapServers, the way the Walloon public service (SPW) publishes them.
  #
  # The SPW publishes its terrain model only as a MapServer: no WCS, no
  # ImageServer, and a colour-ramp renderer that cannot be overridden. But
  # `identify` accepts a MULTIPOINT and returns one pixel value per point, in
  # order: 20,000 elevations per request (~9 s). A 1 m grid of a square
  # kilometre and its margin takes about ninety requests per dataset.
  #
  # Configuration (region settings `relief`):
  #   datasets: { terrain: { url:, label: }, surface: {…}, landcover: {…}, texture: {…} }
  #   attribution, label, chunk (points per request), threads.
  class ArcgisElevation
    class Error < StandardError; end

    OPEN_TIMEOUT = 10
    READ_TIMEOUT = 90
    ATTEMPTS = 3
    CHUNK = 20_000
    TEXTURE_MAX_PX = 4096
    RETRIABLE = [ Error, JSON::ParserError, Faraday::TimeoutError, Faraday::ConnectionFailed,
                  Faraday::ServerError, Faraday::SSLError ].freeze

    attr_reader :config

    # `connection`: a Faraday connection (tests inject one with WebMock);
    # `sleeper`: waits between attempts (tests make it instant).
    def initialize(config, connection: nil, sleeper: ->(seconds) { sleep(seconds) })
      @config = config.deep_stringify_keys
      @connection = connection
      @sleeper = sleeper
    end

    def key = "arcgis_elevation"
    def label = config["label"].presence || config.dig("datasets", "terrain", "label")
    def attribution = config["attribution"]
    def chunk_size = (config["chunk"] || CHUNK).to_i
    def threads = (config["threads"] || 3).to_i.clamp(1, 6)

    def dataset?(name) = dataset_url(name).present?
    def dataset_label(name) = config.dig("datasets", name.to_s, "label")
    def dataset_url(name) = config.dig("datasets", name.to_s, "url")

    # One value per point (EPSG:3857 [x, y]), in the order of the points. A
    # short answer would shift the whole grid: refuse rather than guess.
    def sample(name, points, extent)
      url = dataset_url(name) or raise Error, "dataset #{name} not configured"
      params = {
        f: "json", geometryType: "esriGeometryMultipoint", sr: "3857", layers: "all:0", tolerance: "0",
        returnGeometry: "false", imageDisplay: "1000,1000,96",
        mapExtent: extent.mercator_bbox.map { |v| v.round(3) }.join(","),
        geometry: { points: points.map { |x, y| [ x.round(3), y.round(3) ] }, spatialReference: { wkid: 3857 } }.to_json
      }
      parser = name.to_s == "landcover" ? method(:parse_class) : method(:parse_height)
      with_retries do
        body = JSON.parse(post("#{url}/identify", params))
        raise Error, body["error"].to_json if body["error"]

        results = body["results"] || []
        raise Error, "#{results.size} values for #{points.size} points" unless results.size == points.size

        results.map { |result| parser.call(result["attributes"]) }
      end
    end

    # The ortho on the exact extent of the cell centres. The image keeps the
    # extent's aspect ratio: otherwise ArcGIS widens the requested box and the
    # photo slides over the relief.
    def texture(extent, max_px: TEXTURE_MAX_PX)
      url = dataset_url(:texture) or raise Error, "texture not configured"
      west, south, east, north = extent.mercator_bbox
      width_m = east - west
      height_m = north - south
      width = [ max_px, (max_px * width_m / height_m).round ].min
      height = (width * height_m / width_m).round
      params = { f: "image", format: "jpg", bboxSR: "3857", imageSR: "3857", size: "#{width},#{height}",
                 bbox: [ west, south, east, north ].map { |v| v.round(3) }.join(",") }
      image = with_retries { get("#{url}/export", params) }
      raise Error, "the ortho is not a JPEG image" unless image.to_s.b.start_with?("\xFF\xD8".b)

      { bytes: image, width:, height: }
    end

    private
      def with_retries
        attempt = 0
        begin
          attempt += 1
          yield
        rescue *RETRIABLE => e
          raise Error, "#{e.class}: #{e.message.to_s[0, 200]}" if attempt >= ATTEMPTS

          Rails.logger.info("[relief] retry #{attempt} after #{e.class}: #{e.message.to_s[0, 120]}")
          @sleeper.call(2 * attempt)
          retry
        end
      end

      def post(url, params)
        response = connection.post(url) do |request|
          request.headers["Content-Type"] = "application/x-www-form-urlencoded"
          request.body = URI.encode_www_form(params)
        end
        response.body
      end

      def get(url, params)
        connection.get(url, params).body
      end

      def connection
        @connection ||= Faraday.new do |f|
          f.options.open_timeout = OPEN_TIMEOUT
          f.options.timeout = READ_TIMEOUT
          f.headers["User-Agent"] = "SemistoDesigner/1.0 (+https://designer.semisto.org)"
          f.response :raise_error
        end
      end

      def parse_height(attributes)
        value = attributes.to_h.values.first
        Float(value)
      rescue ArgumentError, TypeError
        nil
      end

      def parse_class(attributes)
        Integer(attributes.to_h.values.first.to_s, exception: false)
      end
  end
end
