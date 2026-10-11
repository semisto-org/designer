# Sends a PhotoRendering to Magnific, then checks on it every few seconds
# until the image is ready (it usually takes half a minute), and stores it
# as a new photo of the map. A rendering that is not done after
# PhotoRendering::DEADLINE fails with « timeout ».
class PhotoRenderingJob < ApplicationJob
  queue_as :default
  discard_on ActiveRecord::RecordNotFound, ActiveJob::DeserializationError

  POLL_EVERY = 4.seconds
  # The generated image is downloaded from Magnific's CDN.
  DOWNLOAD_TIMEOUT = 60
  DOWNLOAD_MAX_BYTES = 30.megabytes

  def perform(rendering)
    return if rendering.finished?
    provider = Providers::Magnific.new

    task = if rendering.task_id.blank?
      submitted = provider.create(prompt: rendering.prompt, image_url: rendering.input_url, content_type: rendering.input.content_type)
      rendering.update!(task_id: submitted.id, status: "running", submitted_at: Time.current)
      submitted
    else
      provider.task(rendering.task_id)
    end

    if task.completed? && task.images.any?
      store(rendering, task.images.first)
    elsif task.finished?
      rendering.fail!("failed")
    else
      poll_again(rendering)
    end
  rescue Providers::Magnific::NotConfigured
    rendering.fail!("not_configured")
  rescue Providers::Magnific::Unavailable => error
    Rails.logger.warn("[photo_renderings] #{rendering.id}: #{error.message}")
    # A hiccup while waiting does not lose an image already paid for.
    if error.reason == :upstream && rendering.task_id.present?
      poll_again(rendering)
    else
      rendering.fail!(error.reason)
    end
  end

  private
    def poll_again(rendering)
      started = rendering.submitted_at || rendering.created_at
      return rendering.fail!("timeout") if started < PhotoRendering::DEADLINE.ago
      self.class.set(wait: POLL_EVERY).perform_later(rendering)
    end

    def store(rendering, url)
      response = download(url)
      body = response.body.to_s
      content_type = image_type(response, body)
      unless response.is_a?(Net::HTTPSuccess) && content_type && body.bytesize.between?(1, DOWNLOAD_MAX_BYTES)
        report(rendering, "download answered HTTP #{response.code} (#{response["content-type"]}, #{body.bytesize} bytes) from #{URI(url).host}: #{body.first(200)}")
        return rendering.fail!("download")
      end
      rendering.complete!(StringIO.new(body), content_type:)
    rescue Net::OpenTimeout, Net::ReadTimeout, SocketError, SystemCallError, OpenSSL::SSL::SSLError, URI::InvalidURIError => error
      report(rendering, "download failed (#{error.class}: #{error.message})")
      rendering.fail!("download")
    end

    # A lost image was paid for: say why in the logs and in Sentry.
    def report(rendering, message)
      Rails.logger.warn("[photo_renderings] #{rendering.id}: #{message}")
      Sentry.capture_message("Photo rendering #{rendering.id}: #{message}", level: :warning) if defined?(Sentry) && Sentry.initialized?
    end

    # The generated image's URL carries a signed token
    # (`?token=exp=…~hmac=…`): it is requested exactly as given. Faraday
    # re-encodes the query (`=` becomes `%3D`) and the CDN answers 403.
    # The CDN may also redirect to the stored file.
    def download(url, redirects: 3)
      uri = URI(url)
      response = Net::HTTP.start(uri.host, uri.port, use_ssl: uri.scheme == "https", open_timeout: 10, read_timeout: DOWNLOAD_TIMEOUT) do |http|
        http.request(Net::HTTP::Get.new(uri.request_uri, "User-Agent" => Providers::GeoHttp::USER_AGENT, "Accept" => "image/*"))
      end
      location = response["location"]
      return response unless response.is_a?(Net::HTTPRedirection) && location.present? && redirects.positive?
      download(URI.join(url, location).to_s, redirects: redirects - 1)
    end

    # The type of the image, read from its first bytes when the CDN only
    # says « application/octet-stream ».
    def image_type(response, body)
      declared = response["content-type"].to_s.split(";").first.to_s.strip.downcase
      return declared if MapPhoto::CONTENT_TYPES.include?(declared)
      detected = Marcel::MimeType.for(StringIO.new(body.byteslice(0, 64) || ""))
      detected if MapPhoto::CONTENT_TYPES.include?(detected)
    end
end
