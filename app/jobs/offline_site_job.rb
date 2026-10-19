# Builds a map's offline site (OfflineSite::Builder) and replaces the
# previous archive. Tiles, photos and documents take a few minutes on a
# large map; the « Exporter » menu follows the status.
class OfflineSiteJob < ApplicationJob
  queue_as :default
  limits_concurrency to: 1, key: ->(site) { site.id }, duration: MapOfflineSite::STALE_AFTER if respond_to?(:limits_concurrency)
  discard_on ActiveRecord::RecordNotFound

  def perform(site)
    site.update!(status: "building")
    builder = OfflineSite::Builder.new(site.map, user: site.requested_by, include_networks: site.include_networks)
    Tempfile.create([ "offline-site", ".zip" ], binmode: true) do |file|
      builder.write(file)
      file.rewind
      site.archive.attach(io: file, filename: site.filename, content_type: "application/zip")
    end
    site.update!(status: "ready", finished_at: Time.current, summary: builder.summary)
  rescue StandardError => e
    # The menu says it failed and offers to try again: no silent retries.
    site.update!(status: "failed", error: e.message.truncate(250), finished_at: Time.current)
    Rails.error.report(e, context: { map_id: site.map_id })
  end
end
