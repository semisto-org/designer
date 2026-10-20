module Mcp
  # Every tool of the MCP server, in the order of the documentation.
  module Tools
    def self.all
      [
        ListMaps, GetMap, ListFeatures, GetFeature, GetRegionLayers, IdentifyAtPoint, GetSiteData, TraceContour, GetCatchment, FindKeypoints, TraceParallels, GetStormObservations, GetSeasonSigns, GetElementFunctions,
        SearchPlants, GetPlant, GetDesignGuide, GetHelp, GetMyPlan, GetProjectSheet, GetImplementationPlan, GetBioindicatorPhoto, GetSoilSamples, GetSoilReport,
        ListTasks, ListHarvests, ListPlantObservations, ListStorageReadings, ListDocuments, GetDocument, ListPhotos, GetPhoto, ListDronePilots, ListDroneMissions,
        ProposeFeatures, ProposeSectors, ProposeFeatureUpdates, ProposeDeletions, ProposePalette, ProposeProjectSheet, ProposePhases, ProposeBioindicators, ProposeSoilResults, WithdrawDraft,
        CreateTasks, UpdateTasks, RecordHarvests, RecordPlantObservations, RecordStorageReadings, AddDocument, UpdateDocument, AddPhoto, UpdatePhotos, DeletePhotos,
        CreateUpload, AttachPhotos, AttachDocuments, ImportFromUrl, DeleteDocuments
      ]
    end
  end
end
