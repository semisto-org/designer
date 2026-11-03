# The real 3D buildings a region publishes (walls and roofs measured, not
# guessed from a footprint), chosen per region in its settings:
#
#   "buildings_3d" => { "provider" => "urbis", "label" => "…", "attribution" => "…" }
#
#   models = Providers::BuildingModels.for(region) # => nil without a model
#   models.within(south:, west:, north:, east:)     # => [Model, ...]
#   models.attribution
#
# Brussels has one (UrbIS Buildings 3D). Luxembourg's Building 3D (LoD2.2,
# CC0) would be the next provider here. Off with BUILDING_MODELS=none.
module Providers
  module BuildingModels
    # Any provider's failure (each provider's own error inherits from it).
    class Unavailable < StandardError; end

    def self.providers = { "urbis" => UrbisBuildings3d }

    def self.for(region, env = ENV)
      return nil if region.nil? || env.fetch("BUILDING_MODELS", "").strip.downcase == "none"

      settings = region.setting(:buildings_3d)
      klass = providers[settings["provider"].to_s] if settings.is_a?(Hash)
      klass&.new(feed_url: settings["feed_url"], attribution: settings["attribution"])
    end
  end
end
