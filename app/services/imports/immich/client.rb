module Imports
  module Immich
    # Read-only client of an Immich server (Semisto's photo library): its
    # albums, the assets of an album with their EXIF (position, date,
    # description), and the files behind them. Authenticated with an API key
    # (`x-api-key`, created in Immich under Account settings > API keys, with
    # the asset.read, asset.download and album.read permissions). Nothing is
    # ever written to Immich.
    #
    # ENV: IMMICH_URL (the server, /api is added when missing), IMMICH_API_KEY.
    class Client
      PAGE_SIZE = 1000
      MAX_PAGES = 200
      OPEN_TIMEOUT = 5
      TIMEOUT = 30
      DOWNLOAD_TIMEOUT = 120
      RETRIES = 2
      MAX_REDIRECTS = 3
      REDIRECTS = [ 301, 302, 303, 307, 308 ].freeze

      Download = Data.define(:body, :content_type)
      FileDownload = Data.define(:file, :content_type)

      # The file is not there (404), e.g. no full-size rendition generated.
      class NotFound < Error; end

      attr_reader :base_url

      def self.from_env
        new(url: ENV["IMMICH_URL"], key: ENV["IMMICH_API_KEY"])
      end

      def initialize(url:, key:, connection: nil, sleeper: ->(seconds) { sleep(seconds) })
        @base_url = self.class.api_url(url)
        @key = key.to_s.strip.presence
        @connection = connection
        @sleeper = sleeper
      end

      # "https://photos.example" → "https://photos.example/api".
      def self.api_url(url)
        url = url.to_s.strip.chomp("/")
        url.end_with?("/api") || url.empty? ? url : "#{url}/api"
      end

      def configured? = @key.present? && base_url.present?

      # Every album the key can read: own and shared ones.
      def albums
        (request(:get, "albums") + request(:get, "albums", { shared: true })).uniq { |album| album["id"] }
      end

      def album(id) = request(:get, "albums/#{id}")

      # The assets of an album, with their EXIF, through the metadata search
      # (album responses no longer list their assets). Pages are followed by
      # `nextCursor` (Immich 3.2+) or `nextPage` (earlier versions).
      def each_album_asset(album_id)
        return enum_for(:each_album_asset, album_id) unless block_given?
        query = { albumIds: [ album_id ], withExif: true, size: PAGE_SIZE }
        page = { page: 1 }
        MAX_PAGES.times do
          body = request(:post, "search/metadata", query.merge(page))
          assets = body.is_a?(Hash) ? body["assets"] : nil
          raise Error.new(:unreadable, url: url_for("search/metadata")) unless assets.is_a?(Hash) && assets["items"].is_a?(Array)
          assets["items"].each { |asset| yield asset }
          if assets["nextCursor"].present?
            page = { cursor: assets["nextCursor"] }
          elsif assets["nextPage"].present?
            page = { page: assets["nextPage"].to_i }
          else
            break
          end
        end
      end

      # The original file, as uploaded (EXIF included).
      def original(id, max_bytes:) = download("assets/#{id}/original", max_bytes:)

      # The original streamed to a Tempfile, for files too big to hold in
      # memory (videos up to MapPhoto::VIDEO_MAX_BYTES). The caller closes it.
      def original_file(id, max_bytes:)
        raise Error.new(:not_configured) unless configured?
        path = "assets/#{id}/original"
        url = url_for(path)
        file = Tempfile.new([ "immich-", ".bin" ], binmode: true)
        response = with_retries(url) do
          file.truncate(0)
          file.rewind
          download_connection.get(path) do |request|
            request.options.on_data = proc do |chunk, received, env|
              next unless env.nil? || (200..299).cover?(env.status)
              raise Error.new(:too_large, url:, max: max_bytes / 1.megabyte) if received > max_bytes
              file.write(chunk)
            end
          end
        end
        check!(response, url)
        file.flush
        file.rewind
        FileDownload.new(file:, content_type: response.headers["content-type"].to_s.split(";").first.to_s.strip)
      rescue StandardError
        file&.close!
        raise
      end

      # A JPEG rendition made by Immich: `fullsize` (when the server
      # generates it) or `preview` (always there, about 1440 px).
      def rendition(id, size:, max_bytes:) = download("assets/#{id}/thumbnail", { size: }, max_bytes:)

      private
        def request(method, path, params = {})
          raise Error.new(:not_configured) unless configured?
          url = url_for(path)
          response = with_retries(url) do
            method == :post ? connection.post(path, params.to_json, "Content-Type" => "application/json") : connection.get(path, params)
          end
          check!(response, url)
          JSON.parse(response.body.to_s)
        rescue JSON::ParserError
          raise Error.new(:unreadable, url:)
        end

        # Immich answers some renditions with a redirect (e.g. to the original
        # when it has no full-size JPEG): follow it, with the key only on
        # Immich's own host.
        def download(path, params = {}, max_bytes:)
          raise Error.new(:not_configured) unless configured?
          url = url_for(path)
          response = with_retries(url) { download_connection.get(path, params) }
          MAX_REDIRECTS.times do
            break unless REDIRECTS.include?(response.status) && response.headers["location"].present?
            target = URI.join("#{url}/", response.headers["location"])
            url = target.to_s
            headers = target.host == URI.parse(base_url).host ? {} : { "x-api-key" => nil }
            response = with_retries(url) { download_connection.get(url, nil, headers) }
          end
          check!(response, url)
          body = response.body.to_s.b
          raise Error.new(:too_large, url:, max: max_bytes / 1.megabyte) if body.bytesize > max_bytes
          Download.new(body:, content_type: response.headers["content-type"].to_s.split(";").first.to_s.strip)
        end

        def check!(response, url)
          case response.status
          when 200..299 then nil
          when 401, 403 then raise Error.new(:unauthorized, status: response.status, url:)
          when 404 then raise NotFound.new(:unavailable, url:, detail: "HTTP 404")
          else raise Error.new(:unavailable, url:, detail: "HTTP #{response.status}")
          end
        end

        # Timeouts, refused connections, 429 and 5xx are retried with a short
        # back-off; anything else is answered at once.
        def with_retries(url)
          attempt = 0
          begin
            response = yield
            raise Faraday::ServerError, "HTTP #{response.status}" if retryable?(response.status) && attempt < RETRIES
            response
          rescue Faraday::TimeoutError, Faraday::ConnectionFailed, Faraday::ServerError => error
            attempt += 1
            raise Error.new(:unavailable, url:, detail: error.message) if attempt > RETRIES
            @sleeper.call(attempt)
            retry
          end
        end

        def retryable?(status) = status == 429 || status >= 500

        def url_for(path) = "#{base_url}/#{path}"

        def headers
          { "x-api-key" => @key, "Accept" => "application/json", "User-Agent" => Providers::GeoHttp::USER_AGENT }
        end

        def connection
          @connection ||= Faraday.new(url: "#{base_url}/", headers:) do |f|
            f.options.open_timeout = OPEN_TIMEOUT
            f.options.timeout = TIMEOUT
          end
        end

        def download_connection
          @download_connection ||= Faraday.new(url: "#{base_url}/", headers: headers.merge("Accept" => "*/*")) do |f|
            f.options.open_timeout = OPEN_TIMEOUT
            f.options.timeout = DOWNLOAD_TIMEOUT
          end
        end
    end
  end
end
