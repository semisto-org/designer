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
      unless response.success? && content_type && body.bytesize.between?(1, DOWNLOAD_MAX_BYTES)
        Rails.logger.warn("[photo_renderings] #{rendering.id}: download answered HTTP #{response.status} " \
                          "(#{response.headers["content-type"]}, #{body.bytesize} bytes)")
        return rendering.fail!("download")
      end
      rendering.complete!(StringIO.new(body), content_type:)
    rescue Faraday::Error => error
      Rails.logger.warn("[photo_renderings] #{rendering.id}: download failed (#{error.class})")
      rendering.fail!("download")
    end

    # Magnific's CDN may answer with a redirect to the stored file.
    def download(url, redirects: 3)
      response = Faraday.new(request: { open_timeout: 10, timeout: DOWNLOAD_TIMEOUT }).get(url)
      location = response.headers["location"]
      return response unless response.status.between?(300, 399) && location.present? && redirects.positive?
      download(URI.join(url, location).to_s, redirects: redirects - 1)
    end

    # The type of the image, read from its first bytes when the CDN only
    # says « application/octet-stream ».
    def image_type(response, body)
      declared = response.headers["content-type"].to_s.split(";").first.to_s.strip.downcase
      return declared if MapPhoto::CONTENT_TYPES.include?(declared)
      detected = Marcel::MimeType.for(StringIO.new(body.byteslice(0, 64) || ""))
      detected if MapPhoto::CONTENT_TYPES.include?(detected)
    end
end
