module Mcp
  # Every tool of the MCP server, in the order of the documentation.
  module Tools
    def self.all
      [
        ListMaps, GetMap, ListFeatures, GetFeature, GetRegionLayers, IdentifyAtPoint, GetSiteData, TraceContour, GetCatchment,
        SearchPlants, GetPlant, GetDesignGuide, GetProjectSheet, GetBioindicatorPhoto, GetSoilSamples, GetSoilReport,
        ListTasks, ListDocuments, GetDocument, ListPhotos, GetPhoto,
        ProposeFeatures, ProposePalette, ProposeProjectSheet, ProposeBioindicators, ProposeSoilResults, WithdrawDraft,
        CreateTasks, UpdateTasks, AddDocument, UpdateDocument, AddPhoto, UpdatePhotos, DeletePhotos,
        CreateUpload, AttachPhotos, AttachDocuments, ImportFromUrl, DeleteDocuments
      ]
    end
  end
end
