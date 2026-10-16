# Where the browser fetches an uploaded file once the app has checked who may
# see it.
#
# By default the app streams the file itself (Active Storage's proxy routes,
# signed and short-lived like a bucket link, with byte ranges for pdf.js): the
# page then reads it from its own origin, so pdf.js, MapLibre image sources,
# three.js textures and the sketch canvas work whatever the bucket allows.
# Infomaniak's object storage has no bucket CORS (PutBucketCors answers
# NotImplemented), so a straight bucket link only works for <img> and
# downloads. Set S3_DIRECT_DOWNLOADS=true on a bucket that sends CORS headers
# (bin/rails storage:cors) to redirect to the bucket instead.
module ServesStoredFiles
  extend ActiveSupport::Concern

  private
    def stored_file_url(target, expires_in:, disposition: :inline)
      blob = target.respond_to?(:blob) ? target.blob : target
      if FileStorage.direct_downloads?(blob.service)
        target.url(expires_in:, disposition:)
      else
        rails_storage_proxy_url(target, expires_in:, disposition:)
      end
    end
end
