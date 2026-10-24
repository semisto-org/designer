# Asks for the building footprints around a map's relief ahead of time, so
# that the 3D view (the editor's or the published map's) finds them in the
# cache instead of waiting on OpenStreetMap, which can take tens of seconds.
# Enqueued when a relief is imported and when a map is published.
class BuildingsWarmJob < ApplicationJob
  queue_as :default
  discard_on ActiveRecord::RecordNotFound

  def perform(map)
    bounds = map.terrain&.ready? && map.terrain.bounds
    provider = Providers::Buildings.build
    return unless bounds && provider.available?

    provider.within(**bounds)
  rescue Providers::Buildings::Unavailable
    # The page asks again on its own; nothing is lost.
  end
end
