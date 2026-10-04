# Ported from Claudy (MIT, © 2022-2023 Fondation Les 4 Sources)
module Providers
  # Pl@ntNet, plant identification from photos. One to five photos of the SAME
  # plant (leaf, flower, fruit, bark, habit) go in, the most probable species
  # come out, each with a score. Nothing is kept here: the candidates wait for
  # a human to pick one (PlantIdentification matches them to the catalogue).
  #
  #   plantnet = Providers::PlantNet.new
  #   plantnet.configured?                  # false without PLANTNET_API_KEY
  #   plantnet.identify([{ io:, filename:, content_type: }, ...])  # => [Candidate, ...]
  #
  # ENV:
  # - PLANTNET_API_KEY: the key created on https://my.plantnet.org (without it,
  #   `configured?` is false and the editor disables the feature);
  # - PLANTNET_API_URL: optional, another base URL (defaults to the public API).
  #
  # Pl@ntNet answers 404 when it sees no plant on the photos: that is an
  # empty list, not an error. Anything else that is not a 2xx, a timeout or a
  # garbled body raises Unavailable, so the editor says "try again later"
  # instead of failing.
  class PlantNet
    class Error < StandardError; end
    # No API key: the feature is off.
    class NotConfigured < Error; end
    # Nothing to send, too many photos: refused before any call.
    class InvalidRequest < Error; end
    # Pl@ntNet did not answer well. `reason` is :quota (HTTP 429) or :upstream.
    class Unavailable < Error
      attr_reader :reason

      def initialize(message = "Pl@ntNet unavailable", reason: :upstream)
        super(message)
        @reason = reason
      end
    end

    DEFAULT_URL = "https://my-api.plantnet.org".freeze
    IDENTIFY_PATH = "/v2/identify/all".freeze
    MAX_IMAGES = 5
    MAX_RESULTS = 5
    OPEN_TIMEOUT = 5
    TIMEOUT = 30

    # `latin_name` has no authorship ("Malus domestica"), `score` is 0..1.
    Candidate = Data.define(:latin_name, :authorship, :common_names, :genus, :family, :score, :gbif_id)

    def self.api_key = ENV["PLANTNET_API_KEY"].presence

    def self.configured? = api_key.present?

    def initialize(api_key: self.class.api_key, url: ENV["PLANTNET_API_URL"].presence || DEFAULT_URL)
      @api_key = api_key.presence
      @url = url.to_s.chomp("/")
    end

    def configured? = @api_key.present?

    # `images`: [{ io:, filename:, content_type: }]. Candidates from the most to
    # the least probable; an empty list when Pl@ntNet sees no plant.
    def identify(images)
      raise NotConfigured, "PLANTNET_API_KEY is not set" unless configured?
      raise InvalidRequest, "no image to identify" if images.empty?
      raise InvalidRequest, "#{MAX_IMAGES} images at most" if images.size > MAX_IMAGES

      response = post(images)
      return [] if response.status == 404
      unless response.success?
        raise Unavailable.new("Pl@ntNet answered HTTP #{response.status}", reason: response.status == 429 ? :quota : :upstream)
      end

      parse(response.body)
    rescue Faraday::Error => error
      raise Unavailable, "Pl@ntNet unreachable (#{error.class})"
    end

    private
      def parse(body)
        data = JSON.parse(body.to_s)
        results = data["results"] if data.is_a?(Hash)
        raise Unavailable, "Pl@ntNet answered an unexpected body" unless results.is_a?(Array)

        results.filter_map { |result| candidate(result) }.sort_by { |candidate| -candidate.score }.first(MAX_RESULTS)
      rescue JSON::ParserError, NoMethodError
        raise Unavailable, "Pl@ntNet answered an unreadable body"
      end

      def candidate(result)
        species = result["species"]
        latin_name = species.is_a?(Hash) ? species["scientificNameWithoutAuthor"].to_s.squish : ""
        return if latin_name.blank?

        Candidate.new(
          latin_name:,
          authorship: species["scientificNameAuthorship"].presence,
          common_names: Array(species["commonNames"]).map { |name| name.to_s.squish }.compact_blank,
          genus: species.dig("genus", "scientificNameWithoutAuthor"),
          family: species.dig("family", "scientificNameWithoutAuthor"),
          score: result["score"].to_f.clamp(0.0, 1.0),
          gbif_id: result.dig("gbif", "id")&.to_s
        )
      end

      def post(images)
        boundary = "plantnet-#{SecureRandom.hex(12)}"
        connection.post(IDENTIFY_PATH) do |request|
          request.params = { "api-key" => @api_key, "lang" => "fr", "nb-results" => MAX_RESULTS, "include-related-images" => "false" }
          request.headers["Content-Type"] = "multipart/form-data; boundary=#{boundary}"
          request.body = multipart(images, boundary)
        end
      end

      def connection
        Faraday.new(url: @url, headers: { "Accept" => "application/json", "User-Agent" => Providers::GeoHttp::USER_AGENT },
                    request: { open_timeout: OPEN_TIMEOUT, timeout: TIMEOUT })
      end

      # The multipart body is written by hand (no extra gem, and a String is
      # easy to read back in tests). `organs=auto`: Pl@ntNet guesses the organ
      # of each photo, nothing more is asked of someone standing at the plant.
      def multipart(images, boundary)
        body = +"".b
        images.each do |image|
          filename = image[:filename].to_s.gsub(/["\r\n\\]/, "_")
          io = image[:io]
          io.rewind if io.respond_to?(:rewind)
          body << "--#{boundary}\r\n"
          body << %(Content-Disposition: form-data; name="images"; filename="#{filename}"\r\n).b
          body << "Content-Type: #{image[:content_type]}\r\n\r\n"
          body << io.read.b << "\r\n"
          body << "--#{boundary}\r\n"
          body << %(Content-Disposition: form-data; name="organs"\r\n\r\nauto\r\n)
        end
        body << "--#{boundary}--\r\n"
      end
  end
end
