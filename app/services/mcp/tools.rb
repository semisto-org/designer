module Mcp
  # Every tool of the MCP server, in the order of the documentation.
  module Tools
    def self.all
      [
        ListMaps, GetMap, ListFeatures, GetFeature, GetRegionLayers, IdentifyAtPoint, GetSiteData,
        SearchPlants, GetPlant, GetDesignGuide, GetProjectSheet, GetBioindicatorPhoto,
        ListTasks, ListDocuments, GetDocument,
        ProposeFeatures, ProposePalette, ProposeProjectSheet, ProposeBioindicators, WithdrawDraft,
        CreateTasks, UpdateTasks, AddDocument, UpdateDocument
      ]
    end
  end
end
