# Purges the files an AI sent through create_upload and never attached to a
# map (McpUpload::UNATTACHED_LIFETIME), so storage does not fill with them.
class McpUploadPurgeJob < ApplicationJob
  queue_as :default

  def perform
    McpUpload.stale.includes(:blob).find_each do |upload|
      blob = upload.blob
      upload.destroy!
      blob.purge unless blob.attachments.exists?
    end
  end
end
