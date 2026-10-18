module Providers
  # Asks Semisto's internal app (Terranova, app.semisto.org) whether an
  # e-mail address belongs to a member of Semisto ASBL in good standing (« en
  # ordre de cotisation »). The answer is only yes or no, with the date the
  # membership fee covers: no name, no member id. The token is a dedicated
  # one, whose only scope is this question (`asbl:standing`).
  #
  #   Providers::SemistoMembership.new.standing("ana@example.org")
  #   # => #<data Standing in_good_standing=true, paid_through=#<Date 2026-12-31>>
  #
  # ENV: TERRANOVA_API_URL (shared with the plant catalogue client),
  #      SEMISTO_MEMBERSHIP_API_TOKEN (without it, `configured?` is false and
  #      nobody gets the member price automatically).
  class SemistoMembership
    class Unavailable < StandardError; end

    Standing = Data.define(:in_good_standing, :paid_through)
    PATH = "asbl/standing".freeze

    def self.configured? = new.configured?

    def initialize(url: ENV["TERRANOVA_API_URL"].presence || Terranova::DEFAULT_URL, token: ENV["SEMISTO_MEMBERSHIP_API_TOKEN"], connection: nil)
      @base_url = url.to_s.chomp("/")
      @token = token.presence
      @connection = connection
    end

    def configured? = @token.present?

    def standing(email)
      raise Unavailable, "SEMISTO_MEMBERSHIP_API_TOKEN is not set" unless configured?
      response = connection.post(PATH, { email: email.to_s.strip.downcase }.to_json)
      raise Unavailable, "#{PATH}: HTTP #{response.status}" unless response.success?
      body = JSON.parse(response.body)
      raise Unavailable, "#{PATH}: unexpected response" unless body.is_a?(Hash)
      Standing.new(in_good_standing: body["in_good_standing"] == true, paid_through: body["paid_through"].presence && Date.iso8601(body["paid_through"]))
    rescue Faraday::Error, JSON::ParserError, Date::Error => e
      raise Unavailable, "#{PATH}: #{e.message}"
    end

    private
      def connection
        @connection ||= Faraday.new(url: "#{@base_url}/", headers: {
          "Authorization" => "Bearer #{@token}", "Accept" => "application/json", "Content-Type" => "application/json"
        }) do |f|
          f.options.open_timeout = 3
          f.options.timeout = 5
        end
      end
  end
end
