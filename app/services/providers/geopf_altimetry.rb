module Providers
  # French relief from the IGN Géoplateforme: the altimetry API answers the
  # RGE ALTI (1 m terrain model, bare ground) for up to 5,000 points per
  # request, and the WMS-R gives the orthophoto under the relief.
  #
  # Configuration (region settings `relief`):
  #   datasets: { terrain: { url: <elevation.json URL>, resource:, label: },
  #               texture: { url: <WMS URL>, layers:, label: } }
  #   label, attribution, chunk (points per request, ≤ 5,000), threads.
  class GeopfAltimetry
    class Error < StandardError; end

    OPEN_TIMEOUT = 10
    READ_TIMEOUT = 60
    ATTEMPTS = 3
    CHUNK = 5_000
    TEXTURE_MAX_PX = 4096
    NODATA = -99_999
    RETRIABLE = [ Error, JSON::ParserError, Faraday::TimeoutError, Faraday::ConnectionFailed,
                  Faraday::ServerError, Faraday::SSLError ].freeze

    attr_reader :config

    def initialize(config, connection: nil, sleeper: ->(seconds) { sleep(seconds) })
      @config = config.deep_stringify_keys
      @connection = connection
      @sleeper = sleeper
    end

    def key = "geopf_altimetry"
    def label = config["label"].presence || dataset_label(:terrain)
    def attribution = config["attribution"]
    def chunk_size = (config["chunk"] || CHUNK).to_i.clamp(1, CHUNK)
    def threads = (config["threads"] || 3).to_i.clamp(1, 6)

    def dataset?(name) = %w[terrain texture].include?(name.to_s) && dataset_url(name).present?
    def dataset_label(name) = config.dig("datasets", name.to_s, "label")
    def dataset_url(name) = config.dig("datasets", name.to_s, "url")

    # One elevation per EPSG:3857 point, in order; nil where the API has no data.
    def sample(name, points, _extent)
      raise Error, "dataset #{name} not available" unless name.to_s == "terrain" && dataset?(:terrain)

      coordinates = points.map { |x, y| Relief::Mercator.inverse(x, y).map { |v| v.round(7) } }
      body = {
        lon: coordinates.map(&:first).join("|"), lat: coordinates.map(&:last).join("|"),
        resource: config.dig("datasets", "terrain", "resource").presence || "ign_rge_alti_wld", zonly: "true"
      }
      with_retries do
        elevations = Array(JSON.parse(post(dataset_url(:terrain), body))["elevations"])
        raise Error, "#{elevations.size} values for #{points.size} points" unless elevations.size == points.size

        elevations.map { |value| height(value) }
      end
    end

    # The orthophoto on the exact extent of the cell centres (WMS GetMap in
    # EPSG:3857, aspect ratio kept so the photo does not slide).
    def texture(extent, max_px: TEXTURE_MAX_PX)
      url = dataset_url(:texture) or raise Error, "texture not configured"
      west, south, east, north = extent.mercator_bbox
      width_m, height_m = east - west, north - south
      width = [ max_px, (max_px * width_m / height_m).round ].min
      height = (width * height_m / width_m).round
      params = { SERVICE: "WMS", VERSION: "1.3.0", REQUEST: "GetMap", LAYERS: config.dig("datasets", "texture", "layers"),
                 STYLES: "", CRS: "EPSG:3857", FORMAT: "image/jpeg", WIDTH: width, HEIGHT: height,
                 BBOX: [ west, south, east, north ].map { |v| v.round(3) }.join(",") }
      image = with_retries { connection.get(url, params).body }
      raise Error, "the ortho is not a JPEG image" unless image.to_s.b.start_with?("\xFF\xD8".b)

      { bytes: image, width:, height: }
    end

    private
      def height(value)
        number = Float(value)
        number <= NODATA ? nil : number
      rescue ArgumentError, TypeError
        nil
      end

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

      def post(url, body)
        connection.post(url) do |request|
          request.headers["Content-Type"] = "application/json"
          request.body = body.to_json
        end.body
      end

      def connection
        @connection ||= Faraday.new do |f|
          f.options.open_timeout = OPEN_TIMEOUT
          f.options.timeout = READ_TIMEOUT
          f.headers["User-Agent"] = GeoHttp::USER_AGENT
          f.response :raise_error
        end
      end
  end
end
