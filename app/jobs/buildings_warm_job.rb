# Asks for the buildings around a map's relief ahead of time, so that the 3D
# view (the editor's or the published map's) finds them in the cache instead
# of waiting on OpenStreetMap, which can take tens of seconds, or on the
# region's 3D model (a few megabytes per square kilometre to read).
# Enqueued when a relief is imported and when a map is published.
class BuildingsWarmJob < ApplicationJob
  queue_as :default
  discard_on ActiveRecord::RecordNotFound

  def perform(map)
    bounds = map.terrain&.ready? && map.terrain.bounds
    return unless bounds

    warm_models(map, bounds)
    provider = Providers::Buildings.build
    provider.within(**bounds) if provider.available?
  rescue Providers::Buildings::Busy
    # OpenStreetMap was busy, or the page was asking at the same moment:
    # try again a little later, a few times.
    retry_job(wait: 1.minute) if executions < 3
  rescue Providers::Buildings::Unavailable
    # Switched off or too large: nothing to warm.
  end

  private
    def warm_models(map, bounds)
      Providers::BuildingModels.for(map.region)&.within(**bounds)
    rescue Providers::BuildingModels::Unavailable
      # The page will ask on its own.
    end
end
