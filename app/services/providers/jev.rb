# Ported from Claudy (MIT, © 2022-2023 Fondation Les 4 Sources)
#
# Jev, the « System One » model of TypeSafe. It generates no text: it gives
# typed judgements on a text we show it (a choice among options we give, the
# probability of a yes, a score), each with its confidence. It cannot invent a
# value, which is why the catalogue review lets it check one.
#
#   jev = Providers::Jev.build
#   jev.available?   # false without TYPESAFE_API_KEY
#   jev.ask(state: { plant: "…", lines: "…" }, questions: { "foliage_type" => { type: "choice", … } })
#   # => { "foliage_type" => { "choice" => "evergreen", "confidence" => 0.93, … } }
#
# Raises Providers::Jev::Unavailable (no key, timeout, error) so callers say
# they could not check instead of « not found ».
#
# Configured by ENV:
# - TYPESAFE_API_KEY: the API key (https://typesafe.ai)
module Providers
  class Jev
    class Unavailable < StandardError; end

    ENDPOINT = "https://api.typesafe.ai/v1/systemone".freeze
    MODEL = "jev-latest".freeze
    OPEN_TIMEOUT = 5
    TIMEOUT = 90
    # 429 (rate) and 529 (overloaded) are documented as « try again later ».
    RETRYABLE = [ 429, 500, 502, 503, 529 ].freeze
    ATTEMPTS = 3

    def self.build(env = ENV) = new(api_key: env["TYPESAFE_API_KEY"].presence)

    def initialize(api_key:, connection: nil, sleeper: ->(seconds) { sleep(seconds) })
      @api_key = api_key
      @connection = connection
      @sleeper = sleeper
    end

    def available? = @api_key.present?

    # `questions`: { id => { type:, instructions:, criteria: } }, see the
    # TypeSafe API. Returns { id => answer } (`choice`, `confidence` for a
    # choice; `noul` for a yes/no). All questions share one state, billed once.
    def ask(state:, questions:)
      raise Unavailable, "not configured" unless available?
      return {} if questions.empty?

      ATTEMPTS.times do |attempt|
        response = connection.post(ENDPOINT, { model: MODEL, state:, questions: }.to_json)
        return JSON.parse(response.body).fetch("answers", {}) if response.success?
        raise Unavailable, "HTTP #{response.status}" unless RETRYABLE.include?(response.status) && attempt < ATTEMPTS - 1

        @sleeper.call(2**(attempt + 1))
      end
    rescue JSON::ParserError
      raise Unavailable, "garbled answer"
    rescue Faraday::Error => error
      raise Unavailable, error.class.name
    end

    private
      def connection
        @connection ||= Faraday.new(request: { open_timeout: OPEN_TIMEOUT, timeout: TIMEOUT }) do |f|
          f.headers["Authorization"] = "Bearer #{@api_key}"
          f.headers["Content-Type"] = "application/json"
        end
      end
  end
end
