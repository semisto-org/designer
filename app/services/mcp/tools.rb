module Mcp
  # Every tool of the MCP server, in the order of the documentation.
  module Tools
    def self.all
      [
        ListMaps, GetMap, ListFeatures, GetFeature, GetRegionLayers, IdentifyAtPoint, GetSiteData,
        SearchPlants, GetPlant, GetDesignGuide, GetProjectSheet,
        ProposeFeatures, ProposePalette, ProposeProjectSheet, WithdrawDraft
      ]
    end
  end
end
