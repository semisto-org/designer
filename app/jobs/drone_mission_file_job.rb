# Puts together the parts of a file a drone pilot delivered with a mission
# (point cloud, 3D model, report…), checks it against the MD5 the browser
# read, and attaches it to the mission. A file that does not match is
# dropped; the pilot sends it again.
class DroneMissionFileJob < ApplicationJob
  queue_as :default

  def perform(mission, upload)
    return if upload.attached?
    upload.assemble!
    mission.files.attach(upload.blob)
    upload.update!(attached_at: Time.current)
  rescue McpUpload::Incomplete => e
    Rails.logger.info("[drone_missions] file #{upload.id} of mission #{mission.id} dropped: #{e.message}")
    upload.discard!
    upload.destroy!
  end
end
