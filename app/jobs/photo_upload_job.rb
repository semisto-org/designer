# Puts together the parts of a large video sent from the « Photos » panel,
# checks it against the MD5 the browser read, and makes the photo with what
# the person typed. The browser asks Maps::PhotoUploadsController#show
# until the upload says which photo it became, or why it could not.
class PhotoUploadJob < ApplicationJob
  queue_as :default

  def perform(upload)
    return if upload.attached? || upload.failure.present?
    upload.assemble!
    photo = build_photo(upload)
    if photo.save
      upload.update!(attached_at: Time.current, map_photo: photo)
    else
      fail_with(upload, photo.errors.full_messages.to_sentence)
    end
  rescue McpUpload::Incomplete => e
    fail_with(upload, I18n.t(e.missing.any? ? "soil_photos.errors.parts_missing" : "soil_photos.errors.checksum_mismatch"))
  rescue ActiveRecord::RecordNotUnique
    fail_with(upload, I18n.t("soil_photos.errors.already_imported", name: upload.blob.filename.to_s))
  end

  private
    def build_photo(upload)
      attributes = (upload.photo_params || {}).symbolize_keys
      mission = attributes.delete(:drone_mission_id).then { upload.map.drone_missions.find_by(id: _1) if _1 }
      lng, lat = attributes.delete(:lng), attributes.delete(:lat)
      attributes[:location] = MapPhoto.point_from(lng, lat) unless lng.nil? && lat.nil?
      photo = upload.map.photos.new(attributes.merge(image: upload.blob, uploaded_by: upload.user, drone_mission: mission))
      # What a client paid a pilot for is never refused for lack of room.
      photo.skip_storage_quota = mission.present?
      photo.map_feature_id ||= photo.retake_of.map_feature_id if photo.retake_of&.map_id == upload.map_id
      photo
    end

    # The row stays (the browser reads `failure`); the parts and the file go,
    # and McpUploadPurgeJob takes the rest a day later.
    def fail_with(upload, message)
      upload.delete_parts
      upload.blob.service.delete(upload.blob.key)
      upload.update!(failure: message.presence || I18n.t("soil_photos.errors.upload_failed"))
    end
end
