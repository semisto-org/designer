# Reads what the original file says about the camera (PhotoCamera) into
# MapPhoto#camera, and prepares the « large » variant the photo viewer shows,
# so the first person to open the photo does not wait for libvips.
#
# Called once per new photo, and by the recurring backfill for photos that
# have never been read (`PhotoCameraJob.backfill`).
class PhotoCameraJob < ApplicationJob
  queue_as :default
  discard_on ActiveRecord::RecordNotFound, ActiveStorage::FileNotFoundError

  BACKFILL_BATCH = 50

  # Runs in the recurring task itself, one photo after the other, so a slow
  # batch never piles the same photos up in the queue.
  def self.backfill(limit: BACKFILL_BATCH)
    MapPhoto.where(camera: nil).order(:id).limit(limit).each { |photo| perform_now(photo) }
  end

  def perform(photo)
    return unless photo.image.attached?
    camera = photo.image.blob.open { |file| PhotoCamera.read(file.path) }
    # Recorded even when empty, so a photo is read once.
    changes = { camera: }
    # A drone does not write the EXIF compass direction; its gimbal says it.
    heading = PhotoCamera.heading(camera)
    changes[:heading] = heading if photo.heading.nil? && heading
    photo.update_columns(changes.merge(updated_at: Time.current))
    prepare_large_variant(photo)
  end

  private
    def prepare_large_variant(photo)
      photo.image.variant(:large).processed
    rescue StandardError => error
      Rails.logger.warn("[photos] no large variant for photo #{photo.id}: #{error.class}: #{error.message}")
    end
end
