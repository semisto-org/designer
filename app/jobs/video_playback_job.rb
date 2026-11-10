# Gives a video a copy every browser plays when its own file is not one
# (VideoPlayback): HEVC from a drone or an iPhone, a WebM, a QuickTime file.
# The copy (MapPhoto#playable) is what the photo viewer plays; the original
# stays as it was sent, for editors. Terranova adds the copy itself, so it
# does not count against the map's storage allowance.
#
# Called once per new video, and by the recurring backfill for videos never
# checked (`VideoPlaybackJob.backfill`, one at a time: encoding is slow).
class VideoPlaybackJob < ApplicationJob
  queue_as :default
  discard_on ActiveRecord::RecordNotFound, ActiveJob::DeserializationError

  UNREADABLE = [ ActiveStorage::FileNotFoundError, ActiveStorage::IntegrityError ].freeze

  def self.backfill(limit: 1)
    MapPhoto.videos.where(playback: nil).order(:id).limit(limit).each { |video| perform_now(video) }
  end

  def perform(video)
    return unless video.video? && video.image.attached?
    blob = video.image.blob
    playback = blob.open(tmpdir: Dir.tmpdir) do |file|
      plan = VideoPlayback.plan(file.path, blob.content_type)
      next "failed" if plan.nil?
      next "native" if plan == :native
      convert(video, blob, file.path, plan) ? "converted" : "failed"
    end
    video.update_columns(playback:, updated_at: Time.current)
  rescue *UNREADABLE => error
    Rails.logger.warn("[videos] cannot read video #{video.id}: #{error.class}")
    video.update_columns(playback: "failed", updated_at: Time.current)
  end

  private
    def convert(video, blob, path, plan)
      Dir.mktmpdir do |dir|
        output = File.join(dir, "playable.mp4")
        unless VideoPlayback.convert(path, output, plan)
          Rails.logger.warn("[videos] cannot convert video #{video.id} (#{plan})")
          next false
        end
        video.playable.attach(io: File.open(output), filename: "#{blob.filename.base}.mp4", content_type: "video/mp4",
                              identify: false)
        true
      end
    end
end
