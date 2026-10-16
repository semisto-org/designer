# Reads what the original file says about the camera (PhotoCamera) into
# MapPhoto#camera, and prepares the « large » variant the photo viewer shows,
# so the first person to open the photo does not wait for libvips.
#
# A video has no camera tags to read: its position and date (VideoMetadata)
# fill the ones the upload did not give, and its still frame is prepared.
#
# Called once per new photo, and by the recurring backfill for photos that
# have never been read (`PhotoCameraJob.backfill`).
class PhotoCameraJob < ApplicationJob
  queue_as :default
  discard_on ActiveRecord::RecordNotFound

  # A file that is gone, or no longer matches its checksum, cannot be read:
  # the photo is recorded as read (no camera) so the backfill moves past it
  # instead of failing on it every ten minutes.
  UNREADABLE = [ ActiveStorage::FileNotFoundError, ActiveStorage::IntegrityError ].freeze

  BACKFILL_BATCH = 50

  # Runs in the recurring task itself, one photo after the other, so a slow
  # batch never piles the same photos up in the queue.
  def self.backfill(limit: BACKFILL_BATCH)
    MapPhoto.where(camera: nil).order(:id).limit(limit).each { |photo| perform_now(photo) }
  end

  def perform(photo)
    return unless photo.image.attached?
    return read_video(photo) if photo.video?
    camera = photo.image.blob.open { |file| PhotoCamera.read(file.path) }
    # Recorded even when empty, so a photo is read once.
    changes = { camera: }
    # A drone does not write the EXIF compass direction; its gimbal says it.
    heading = PhotoCamera.heading(camera)
    changes[:heading] = heading if photo.heading.nil? && heading
    photo.update_columns(changes.merge(updated_at: Time.current))
    prepare_large_variant(photo)
  rescue *UNREADABLE => error
    Rails.logger.warn("[photos] cannot read photo #{photo.id}: #{error.class}")
    photo.update_columns(camera: {}, updated_at: Time.current)
  end

  private
    def read_video(photo)
      found = photo.image.blob.open { |file| VideoMetadata.read(file.path) }
      changes = { camera: {} }
      if photo.location.nil? && found[:lng]
        changes[:location] = MapPhoto.point_from(found[:lng], found[:lat])
        changes[:location_source] = "exif"
      end
      changes[:taken_at] = found[:taken_at] if photo.taken_at.nil? && found[:taken_at]
      photo.update_columns(changes.merge(updated_at: Time.current))
      prepare_large_variant(photo)
    end

    def prepare_large_variant(photo)
      photo.still(:large).processed
    rescue StandardError => error
      Rails.logger.warn("[photos] no large variant for photo #{photo.id}: #{error.class}: #{error.message}")
    end
end
