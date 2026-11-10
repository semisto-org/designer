# Cuts an imported drone view again where someone realigned it
# (AerialViews::Realign). Shares the import's single lane: both use GDAL on
# the same disk.
class AerialViewRealignJob < ApplicationJob
  queue_as :default
  limits_concurrency to: 1, key: ->(_view) { "aerial_view_import" }, group: "aerial_views", duration: 6.hours if respond_to?(:limits_concurrency)
  discard_on ActiveRecord::RecordNotFound

  def perform(view)
    AerialViews::Realign.new(view).call
  rescue StandardError
    # Whatever broke, the view must not stay « being realigned » forever.
    view.finish_alignment!("failed", failure: "conversion_failed")
    raise
  end
end
