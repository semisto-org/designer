# Converts an imported drone view in the background (AerialViews::Import).
# One at a time for the whole server: GDAL on a large orthomosaic uses the
# memory and the disk the rest of the app needs.
class AerialViewImportJob < ApplicationJob
  queue_as :default
  limits_concurrency to: 1, key: ->(_view) { "aerial_view_import" }, duration: 6.hours if respond_to?(:limits_concurrency)
  discard_on ActiveRecord::RecordNotFound

  def perform(view)
    return unless view.status == "processing"
    AerialViews::Import.new(view).call
  end
end
