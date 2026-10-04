module Imports
  module Claudy
    # Read-only client of Claudy's agent API v1 (Les 4 Sources): the map
    # features and the plants, paginated (will_paginate: `page`, `per_page`
    # up to 200, `meta.pages`), and the files behind photo URLs. Bearer
    # authentication with one of Claudy's AGENT_API_TOKEN values. Nothing is
    # ever written to Claudy.
    #
    # ENV: CLAUDY_API_URL (default https://app.les4sources.be/api/v1; the
    # /api/v1 path is added when missing), CLAUDY_API_KEY.
    class Client
      DEFAULT_URL = "https://app.les4sources.be/api/v1".freeze
      PER_PAGE = 200
      MAX_PAGES = 500
      OPEN_TIMEOUT = 5
      TIMEOUT = 30
      DOWNLOAD_TIMEOUT = 60
      RETRIES = 2
      MAX_REDIRECTS = 3

      Download = Data.define(:body, :content_type, :filename)

      # The record vanished in Claudy (404).
      class NotFound < Error; end

      attr_reader :base_url

      def self.from_env
        new(url: ENV["CLAUDY_API_URL"].presence || DEFAULT_URL, key: ENV["CLAUDY_API_KEY"])
      end

      def initialize(url:, key:, connection: nil, sleeper: ->(seconds) { sleep(seconds) })
        @base_url = self.class.api_url(url)
        @key = key.to_s.strip.presence
        @connection = connection
        @sleeper = sleeper
      end

      # "https://claudy.example" → "https://claudy.example/api/v1".
      def self.api_url(url)
        url = url.to_s.strip.chomp("/")
        url.end_with?("/api/v1") || url.empty? ? url : "#{url}/api/v1"
      end

      def configured? = @key.present? && base_url.present?

      def each_map_feature(&) = each_record("map_features", &)
      def each_plant(&) = each_record("plants", &)

      # The detailed record (`notes_log`, `photos`), or nil when it vanished
      # in Claudy between the listing and this call.
      def map_feature(id) = detail("map_features/#{Integer(id)}")
      def plant(id) = detail("plants/#{Integer(id)}")

      # The file behind a photo URL (Active Storage redirects to the storage
      # service). The API key only goes to the API's own host.
      def download(url, max_bytes:)
        uri = URI.parse(url.to_s)
        MAX_REDIRECTS.succ.times do
          raise Error.new(:photo_url, url: url.to_s) unless uri.is_a?(URI::HTTP) && uri.host.present?
          response = with_retries(uri.to_s) { download_connection.get(uri.to_s, nil, download_headers(uri)) }
          if [ 301, 302, 303, 307, 308 ].include?(response.status) && response.headers["location"].present?
            uri = uri.merge(response.headers["location"])
            next
          end
          raise Error.new(:unavailable, url: uri.to_s, detail: "HTTP #{response.status}") unless response.success?
          body = response.body.to_s.b
          raise Error.new(:photo_too_large, url: url.to_s, max: max_bytes / 1.megabyte) if body.bytesize > max_bytes
          return Download.new(body:, content_type: response.headers["content-type"].to_s.split(";").first.to_s.strip,
                              filename: File.basename(uri.path.to_s).presence || "photo")
        end
        raise Error.new(:unavailable, url: url.to_s, detail: "redirections")
      rescue URI::InvalidURIError
        raise Error.new(:photo_url, url: url.to_s)
      end

      private
        def each_record(path)
          return enum_for(:each_record, path) unless block_given?
          raise Error.new(:not_configured) unless configured?
          page = 1
          loop do
            body = get(path, page:, per_page: PER_PAGE)
            rows = body["data"]
            raise Error.new(:unreadable, url: url_for(path)) unless rows.is_a?(Array)
            rows.each { |row| yield row }
            pages = body.dig("meta", "pages").to_i
            break if rows.empty? || page >= pages || page >= MAX_PAGES
            page += 1
          end
        end

        def detail(path)
          get(path)["data"]
        rescue NotFound
          nil
        end

        def get(path, params = {})
          raise Error.new(:not_configured) unless configured?
          url = url_for(path)
          response = with_retries(url) { connection.get(path, params) }
          case response.status
          when 200..299 then parse(response.body, url)
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

        def parse(body, url)
          data = JSON.parse(body.to_s)
          raise Error.new(:unreadable, url:) unless data.is_a?(Hash)
          data
        rescue JSON::ParserError
          raise Error.new(:unreadable, url:)
        end

        def url_for(path) = "#{base_url}/#{path}"

        def connection
          @connection ||= Faraday.new(url: "#{base_url}/", headers: api_headers) do |f|
            f.options.open_timeout = OPEN_TIMEOUT
            f.options.timeout = TIMEOUT
          end
        end

        def download_connection
          @download_connection ||= Faraday.new do |f|
            f.options.open_timeout = OPEN_TIMEOUT
            f.options.timeout = DOWNLOAD_TIMEOUT
          end
        end

        def api_headers
          { "Authorization" => "Bearer #{@key}", "Accept" => "application/json", "User-Agent" => Providers::GeoHttp::USER_AGENT }
        end

        def download_headers(uri)
          same_host = uri.host == URI.parse(base_url).host
          same_host ? api_headers.merge("Accept" => "*/*") : { "User-Agent" => Providers::GeoHttp::USER_AGENT }
        end
    end
  end
end
