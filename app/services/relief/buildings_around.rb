# The buildings around a map's terrain for the 3D relief, as the editor's
# and the published map's 3D views ask for them (GET …/relief/buildings):
#
# - `buildings`: the OpenStreetMap footprints (Providers::Buildings), whose
#   roofs the browser guesses from the surface model;
# - `models`: where the region publishes a real 3D model of its buildings
#   (Providers::BuildingModels, Brussels today), those buildings with their
#   measured roofs. The browser shows them instead of the footprints they
#   cover.
#
# Either may fail on its own: the relief stays usable without them.
module Relief
  class BuildingsAround
    def initialize(map)
      @map = map
    end

    # The JSON answer; nil before the terrain is imported.
    def call
      bounds = @map.terrain&.ready? && @map.terrain.bounds
      return nil unless bounds

      footprints(bounds).merge(models: models(bounds))
    end

    # Whether there is anything to ask for at all.
    def self.available?(map) = Providers::Buildings.build.available? || Providers::BuildingModels.for(map.region).present?

    private
      def footprints(bounds)
        provider = Providers::Buildings.build
        { available: true, attribution: provider.attribution, buildings: provider.within(**bounds).map(&:as_json) }
      rescue Providers::Buildings::Busy
        # OpenStreetMap is busy: the page asks again a little later.
        { available: false, retry: true, attribution: nil, buildings: [] }
      rescue Providers::Buildings::Unavailable
        { available: false, attribution: nil, buildings: [] }
      end

      def models(bounds)
        provider = Providers::BuildingModels.for(@map.region)
        return nil unless provider

        { attribution: provider.attribution, buildings: provider.within(**bounds).map(&:as_json) }
      rescue Providers::BuildingModels::Unavailable => e
        Rails.logger.warn("[buildings_3d] #{@map.region&.key}: #{e.message}")
        nil
      end
  end
end
