module Imports
  module MySemisto
    # Read-only client of the My Semisto API (my.semisto.org, Semisto's
    # internal app): a project's Campfire chat, its lines and the project's
    # people. Bearer authentication with a personal API token of someone who
    # can open the project. Nothing is ever written to My Semisto.
    #
    # Shapes (https://my.semisto.org/api/v1/openapi.json, checked 2026-11-16):
    # - GET /recordings?type=Campfire&project_id=… → { recordings: [{ id, … }] }
    # - GET /recordings/{id}/lines → { lines: [...] }, newest first, pages of
    #   100 through `offset`; `thread_parent_id` gives the replies of one
    #   thread. A line: id, body (text, may be null), author (full name),
    #   author_id, chatbot_id, thread_parent_id, thread_replies_count,
    #   created_at. No e-mail on a line.
    # - GET /projects/{id}/people → { people: [{ id, name, first_name, email }] }
    #
    # ENV: MY_SEMISTO_API_URL (default https://my.semisto.org/api/v1),
    # MY_SEMISTO_API_TOKEN.
    class Client
      DEFAULT_URL = "https://my.semisto.org/api/v1".freeze
      PAGE_SIZE = 100
      MAX_PAGES = 500
      OPEN_TIMEOUT = 5
      TIMEOUT = 30
      RETRIES = 2

      attr_reader :base_url

      def self.from_env
        new(url: ENV["MY_SEMISTO_API_URL"].presence || DEFAULT_URL, token: ENV["MY_SEMISTO_API_TOKEN"])
      end

      def initialize(url:, token:, sleeper: ->(seconds) { sleep(seconds) })
        @base_url = url.to_s.strip.chomp("/")
        @token = token.to_s.strip.presence
        @sleeper = sleeper
      end

      def configured? = @token.present? && base_url.present?

      # The id of the project's chat (its Campfire recording).
      def campfire_id(project_id)
        rows = Array(get("recordings", type: "Campfire", project_id: Integer(project_id))["recordings"])
        rows.find { |row| row["status"].blank? || row["status"] == "active" }&.dig("id") or
          raise Error.new(:no_campfire, project_id:)
      end

      # Every line of the chat, thread replies included, oldest first.
      def lines(recording_id)
        by_id = {}
        each_page("recordings/#{Integer(recording_id)}/lines") { |line| by_id[line["id"]] = line }
        by_id.values.select { |line| line["thread_replies_count"].to_i.positive? }.each do |parent|
          each_page("recordings/#{Integer(recording_id)}/lines", thread_parent_id: parent["id"]) do |line|
            by_id[line["id"]] ||= line if line["thread_parent_id"] == parent["id"]
          end
        end
        by_id.values.sort_by { |line| [ Time.zone.parse(line["created_at"].to_s) || Time.at(0), line["id"].to_i ] }
      end

      def people(project_id)
        Array(get("projects/#{Integer(project_id)}/people")["people"])
      end

      private
        def each_page(path, params = {})
          offset = 0
          MAX_PAGES.times do
            rows = get(path, params.merge(offset:))["lines"]
            raise Error.new(:unreadable, url: url_for(path)) unless rows.is_a?(Array)
            rows.each { |row| yield row }
            break if rows.size < PAGE_SIZE
            offset += rows.size
          end
        end

        def get(path, params = {})
          raise Error.new(:not_configured) unless configured?
          url = url_for(path)
          response = with_retries(url) { connection.get(path, params) }
          case response.status
          when 200..299 then parse(response.body, url)
          when 401, 403 then raise Error.new(:unauthorized, status: response.status, url:)
          when 404 then raise Error.new(:not_found, url:)
          else raise Error.new(:unavailable, url:, detail: "HTTP #{response.status}")
          end
        end

        # Timeouts, refused connections, 429 and 5xx are retried with a short
        # back-off; anything else is answered at once.
        def with_retries(url)
          attempt = 0
          begin
            response = yield
            raise Faraday::ServerError, "HTTP #{response.status}" if (response.status == 429 || response.status >= 500) && attempt < RETRIES
            response
          rescue Faraday::TimeoutError, Faraday::ConnectionFailed, Faraday::ServerError => error
            attempt += 1
            raise Error.new(:unavailable, url:, detail: error.message) if attempt > RETRIES
            @sleeper.call(attempt)
            retry
          end
        end

        def parse(body, url)
          data = JSON.parse(body.to_s)
          raise Error.new(:unreadable, url:) unless data.is_a?(Hash)
          data
        rescue JSON::ParserError
          raise Error.new(:unreadable, url:)
        end

        def url_for(path) = "#{base_url}/#{path}"

        def connection
          @connection ||= Faraday.new(url: "#{base_url}/", headers: {
            "Authorization" => "Bearer #{@token}", "Accept" => "application/json", "User-Agent" => Providers::GeoHttp::USER_AGENT
          }) do |f|
            f.options.open_timeout = OPEN_TIMEOUT
            f.options.timeout = TIMEOUT
          end
        end
    end
  end
end
