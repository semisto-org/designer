module Mcp
  # Every tool of the MCP server, in the order of the documentation.
  module Tools
    def self.all
      [
        ListMaps, GetMap, ListFeatures, GetFeature, GetRegionLayers, GetAerialPhoto, IdentifyAtPoint, GetSiteData, TraceContour, GetCatchment, FindKeypoints, TraceParallels, GetStormObservations, GetSeasonSigns, GetElementFunctions,
        ListTerritories, GetTerritory,
        SearchPlants, GetPlant, GetDesignGuide, GetHelp, GetMyPlan, GetProjectSheet, GetImplementationPlan, GetBioindicatorPhoto, GetSoilSamples, GetSoilReport, GetOffer, GetDocumentTheme,
        ListTasks, ListDiscussion, GetNotifications, ListHarvests, ListPlantObservations, ListStorageReadings, ListDocuments, GetDocument, ListSiteVisits, ListPhotos, GetPhoto, ListDronePilots, ListDroneMissions, ListPropagationRequests,
        ProposeFeatures, ProposeSectors, ProposeZones, ProposeFeatureUpdates, ProposeDeletions, ProposePalette, ProposeProjectSheet, ProposePhases, ProposePresentationSlides, ProposeBioindicators, ProposeSoilResults, ProposeOfferLetter, ProposeDocumentTheme, WithdrawDraft,
        ProposeTerritoryItems, WithdrawTerritoryDrafts,
        CreateTasks, UpdateTasks, RecordHarvests, RecordPlantObservations, RecordStorageReadings, AddDocument, UpdateDocument, ConvertDocumentToPdf, AddPhoto, UpdatePhotos, DeletePhotos,
        CreateUpload, AttachPhotos, AttachDocuments, ImportFromUrl, DeleteDocuments, PrepareOfflineSite
      ]
    end
  end
end
