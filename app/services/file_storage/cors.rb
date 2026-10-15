# The CORS rule of the object storage bucket. Files are served by redirecting
# to a signed bucket URL, and several screens read them from JavaScript (PDF
# documents in pdf.js, plan images and relief rasters in MapLibre and three.js,
# photos under a sketch), which the browser only allows when the bucket names
# the app's origin. Read-only: uploads always go through the app.
#
#   bin/rails storage:cors
module FileStorage
  module Cors
    module_function

    def rules(origins)
      [ {
        allowed_origins: Array(origins),
        allowed_methods: %w[GET HEAD],
        allowed_headers: [ "*" ],
        expose_headers: %w[Accept-Ranges Content-Length Content-Range Content-Type ETag],
        max_age_seconds: 3600
      } ]
    end

    def apply(client:, bucket:, origins:)
      client.put_bucket_cors(bucket:, cors_configuration: { cors_rules: rules(origins) })
    end

    def app_origin = "https://#{ENV.fetch("APP_HOST", "designer.semisto.org")}"
  end
end
