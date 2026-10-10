module Providers
  # Magnific (api.magnific.com), image generation. Used by « Mettre en image »
  # (PhotoRendering): a photo of the terrain, with the idea sketched on it,
  # goes in as a reference image; the idea painted as it could look comes out.
  #
  #   magnific = Providers::Magnific.new
  #   magnific.configured?                                   # false without MAGNIFIC_API_KEY
  #   task = magnific.create(prompt:, image_url:, content_type: "image/jpeg")  # => Task (queued)
  #   task = magnific.task(task.id)                          # => Task, `images` once COMPLETED
  #
  # The model is Nano Banana Pro (Gemini 3), which keeps the viewpoint and
  # the place of every element of a reference image. The work is
  # asynchronous: `create` answers with a task id at once, `task` tells where
  # it stands. The reference image must be reachable by Magnific's servers
  # (a short-lived signed URL of our storage).
  #
  # ENV:
  # - MAGNIFIC_API_KEY: an API key of the organisation's Magnific account
  #   (https://www.magnific.com/user/organization/api-keys). Each image is
  #   paid in credits from that account. Without it, `configured?` is false
  #   and the photo viewer disables the feature;
  # - MAGNIFIC_API_URL: optional, another base URL.
  class Magnific
    class Error < StandardError; end
    class NotConfigured < Error; end
    # Magnific did not answer well. `reason` is :quota (HTTP 402/429),
    # :rejected (HTTP 400/422, the request itself) or :upstream.
    class Unavailable < Error
      attr_reader :reason

      def initialize(message = "Magnific unavailable", reason: :upstream)
        super(message)
        @reason = reason
      end
    end

    DEFAULT_URL = "https://api.magnific.com".freeze
    PATH = "/v1/ai/text-to-image/nano-banana-pro".freeze
    RESOLUTION = "2K".freeze
    OPEN_TIMEOUT = 5
    TIMEOUT = 30

    # `status` is :queued, :running, :completed or :failed; `images` are the
    # URLs of the generated images (empty until completed).
    Task = Data.define(:id, :status, :images) do
      def completed? = status == :completed
      def failed? = status == :failed
      def finished? = completed? || failed?
    end

    STATUSES = { "CREATED" => :queued, "IN_PROGRESS" => :running, "COMPLETED" => :completed, "FAILED" => :failed }.freeze

    def self.api_key = ENV["MAGNIFIC_API_KEY"].presence

    def self.configured? = api_key.present?

    def initialize(api_key: self.class.api_key, url: ENV["MAGNIFIC_API_URL"].presence || DEFAULT_URL)
      @api_key = api_key.presence
      @url = url.to_s.chomp("/")
    end

    def configured? = @api_key.present?

    # `aspect_ratio: "auto"` keeps the reference image's proportions.
    def create(prompt:, image_url:, content_type:)
      raise NotConfigured, "MAGNIFIC_API_KEY is not set" unless configured?

      body = {
        prompt:, aspect_ratio: "auto", resolution: RESOLUTION,
        reference_images: [ { image: image_url, mime_type: content_type } ]
      }
      parse(request { connection.post(PATH, body.to_json) })
    end

    def task(id)
      raise NotConfigured, "MAGNIFIC_API_KEY is not set" unless configured?

      parse(request { connection.get("#{PATH}/#{ERB::Util.url_encode(id)}") })
    end

    private
      def request
        response = yield
        return response if response.success?

        reason = case response.status
        when 402, 429 then :quota
        when 400, 422 then :rejected
        else :upstream
        end
        raise Unavailable.new("Magnific answered HTTP #{response.status}", reason:)
      rescue Faraday::Error => error
        raise Unavailable, "Magnific unreachable (#{error.class})"
      end

      def parse(response)
        data = JSON.parse(response.body.to_s)["data"]
        raise Unavailable, "Magnific answered an unexpected body" unless data.is_a?(Hash) && data["task_id"].present?

        Task.new(
          id: data["task_id"].to_s,
          status: STATUSES.fetch(data["status"].to_s) { raise Unavailable, "Magnific answered an unknown status" },
          images: Array(data["generated"]).grep(String)
        )
      rescue JSON::ParserError, TypeError
        raise Unavailable, "Magnific answered an unreadable body"
      end

      def connection
        Faraday.new(
          url: @url,
          headers: {
            "x-magnific-api-key" => @api_key, "Content-Type" => "application/json", "Accept" => "application/json",
            "User-Agent" => Providers::GeoHttp::USER_AGENT
          },
          request: { open_timeout: OPEN_TIMEOUT, timeout: TIMEOUT }
        )
      end
  end
end
