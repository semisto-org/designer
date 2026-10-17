# Purges the files an AI sent through create_upload and never attached to a
# map (McpUpload::UNATTACHED_LIFETIME), so storage does not fill with them.
# A drone view the browser never finished sending (AERIAL_LIFETIME) stops
# with « upload_expired ».
class McpUploadPurgeJob < ApplicationJob
  queue_as :default

  def perform
    McpUpload.stale.includes(:blob).find_each do |upload|
      blob = upload.blob
      AerialView.where(source_upload_id: upload.id).in_progress.find_each { _1.update!(status: "failed", failure: "upload_expired") }
      upload.delete_parts
      upload.destroy!
      blob.purge unless blob.attachments.exists?
    end
  end
end
