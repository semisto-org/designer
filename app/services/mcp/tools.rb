module Mcp
  # Every tool of the MCP server, in the order of the documentation.
  module Tools
    def self.all
      [
        ListMaps, GetMap, ListFeatures, GetFeature, GetRegionLayers, IdentifyAtPoint,
        SearchPlants, GetPlant, GetDesignGuide, ProposeFeatures, WithdrawDraft
      ]
    end
  end
end
