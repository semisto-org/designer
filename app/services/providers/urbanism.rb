# Town-planning rules at a map's place (zoning, prescriptions, public
# utility easements), behind a small stable interface:
#
#   urbanism = Providers::Urbanism.for(region)  # nil when the region has none
#   urbanism.available?
#   urbanism.rules_for(geojson_geometry)        # => Hash (see Gpu#rules_for)
#
# Picked per region in settings: `site_rules.urbanism = "gpu"` (France: the
# Géoportail de l'urbanisme through the IGN API Carto).
module Providers
  module Urbanism
    class Unavailable < StandardError; end

    ADAPTERS = { "gpu" => "Providers::Urbanism::Gpu" }.freeze

    def self.for(region, env = ENV)
      adapter = ADAPTERS[region&.setting(:site_rules, :urbanism).to_s]
      adapter&.constantize&.build(env)
    end
  end
end
