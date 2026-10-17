# A blob whose file is gone from the storage service (lost upload, object
# removed from the bucket) used to answer 500 on every request for one of its
# variants, and reach Sentry each time. It is a missing image: answer 404 and
# leave a warning in the logs naming the blob, so the gap can still be found.
Rails.application.config.to_prepare do
  ActiveStorage::BaseController.rescue_from ActiveStorage::FileNotFoundError do
    Rails.logger.warn("[active_storage] file missing from #{@blob&.service_name || 'storage'} for blob #{@blob&.id.inspect} (key #{@blob&.key.inspect})")
    head :not_found
  end
end
