module Providers
  # Read-only client of the Terranova plant catalogue API (Semisto's internal
  # app): genera, species and varieties, paginated. Nothing else is ever read
  # (no members, contributors or comments), nothing is ever written.
  #
  # ENV: TERRANOVA_API_URL (default https://app.semisto.org/api/v1),
  #      TERRANOVA_API_TOKEN (Bearer token; without it, `configured?` is false).
  class Terranova
    class Unavailable < StandardError; end

    DEFAULT_URL = "https://app.semisto.org/api/v1".freeze
    PER_PAGE = 200
    MAX_PAGES = 500

    attr_reader :base_url

    def self.configured? = new.configured?

    def initialize(url: ENV["TERRANOVA_API_URL"].presence || DEFAULT_URL, token: ENV["TERRANOVA_API_TOKEN"], connection: nil)
      @base_url = url.to_s.chomp("/")
      @token = token.presence
      @connection = connection
    end

    def configured? = @token.present?

    def each_genus(&) = each_record("plant/genera", "genera", &)
    def each_species(&) = each_record("plant/species", "species", &)
    def each_variety(&) = each_record("plant/varieties", "varieties", &)

    private
      def each_record(path, key)
        return enum_for(:each_record, path, key) unless block_given?
        page = 1
        loop do
          body = get(path, page:, per_page: PER_PAGE)
          rows = Array(body[key])
          rows.each { |row| yield row }
          pages = body.dig("meta", "pages").to_i
          break if rows.empty? || page >= pages || page >= MAX_PAGES
          page += 1
        end
      end

      def get(path, params)
        raise Unavailable, "TERRANOVA_API_TOKEN is not set" unless configured?
        response = connection.get(path, params)
        raise Unavailable, "#{path}: HTTP #{response.status}" unless response.success?
        body = JSON.parse(response.body)
        raise Unavailable, "#{path}: unexpected response" unless body.is_a?(Hash)
        body
      rescue Faraday::Error, JSON::ParserError => e
        raise Unavailable, "#{path}: #{e.message}"
      end

      def connection
        @connection ||= Faraday.new(url: "#{base_url}/", headers: { "Authorization" => "Bearer #{@token}", "Accept" => "application/json" }) do |f|
          f.options.open_timeout = 5
          f.options.timeout = 30
        end
      end
  end
end
