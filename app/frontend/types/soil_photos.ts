// Types of the « Photos » and « Sol » modules (JSON of Maps::PhotosController,
// Maps::SoilSamplesController and Maps::BioindicatorObservationsController).

export type PhotoLocationSource = 'exif' | 'device' | 'map' | 'manual'
export type PhotoSource = 'web' | 'phone' | 'import'

export type MapPhotoData = {
  id: number
  caption: string | null
  takenAt: string | null
  createdAt: string
  lng: number | null
  lat: number | null
  /** Compass direction the camera faced, 0-360 (north = 0). */
  heading: number | null
  source: PhotoSource
  locationSource: PhotoLocationSource | null
  albumId: number | null
  featureId: number | null
  width: number | null
  height: number | null
  byteSize: number | null
  filename: string | null
  uploadedBy: string | null
  /** Distance to a feature, when listed for the inspector. */
  distanceM: number | null
}

export type PhotoAlbumData = {
  id: number
  name: string
  description: string | null
  position: number
  photosCount: number
}

export type PhotoLimits = { maxBytes: number; contentTypes: string[] }

export type PhotosResponse = { photos: MapPhotoData[]; albums: PhotoAlbumData[]; limits: PhotoLimits }

/** What the browser reads from the EXIF block of a file. */
export type PhotoMeta = {
  lng: number | null
  lat: number | null
  heading: number | null
  /** Local wall-clock time without zone: "2026-05-17T14:32:10". */
  takenAt: string | null
}

// --- Soil -------------------------------------------------------------

export type SoilResultKey =
  | 'ph_water' | 'ph_kcl' | 'organic_matter_pct' | 'c_n_ratio'
  | 'p_mg_100g' | 'k_mg_100g' | 'mg_mg_100g' | 'ca_mg_100g' | 'cec_meq_100g'
  | 'sand_pct' | 'silt_pct' | 'clay_pct'

export type SoilBand = 'low' | 'ok' | 'high'

export type SoilFieldSpec = { key: SoilResultKey; unit: string | null; min: number; max: number }

export type SoilParameterReading = {
  key: SoilResultKey
  value: number
  unit: string | null
  band: SoilBand
  explanation: string
}

export type SoilTextureReading = {
  key: string
  name: string
  description: string
  sand: number
  silt: number
  clay: number
}

export type SoilReading = {
  parameters: SoilParameterReading[]
  texture: SoilTextureReading | null
  provenance: string
}

export type SoilSampleStatus = 'planned' | 'sampled'

export type SoilSampleData = {
  id: number
  label: string
  lng: number | null
  lat: number | null
  status: SoilSampleStatus
  source: 'human' | 'suggested'
  depthFromCm: number
  depthToCm: number
  sampledOn: string | null
  lab: string | null
  labReference: string | null
  results: Partial<Record<SoilResultKey, number>>
  notes: string | null
  hasReport: boolean
  reportFilename: string | null
  createdAt: string
  /** Null when the owner's plan has no analyses. */
  interpretation: SoilReading | null
}

export type SoilSamplesResponse = {
  samples: SoilSampleData[]
  analyses: boolean
  fields: SoilFieldSpec[]
  bands: Record<string, { low_below: number; high_above: number }> | null
  provenance: string
}

export type SuggestedPoint = { lng: number; lat: number; rank: number }
export type SuggestionsResponse = { points: SuggestedPoint[]; usableAreaM2: number; edgeMargin: number; obstacleMargin: number }

export type SoilIndicatorKey =
  | 'compaction' | 'waterlogging' | 'acidic' | 'calcareous' | 'nitrogen_rich'
  | 'nitrogen_poor' | 'disturbed' | 'dry' | 'fertile' | 'trampled'

export type Abundance = 'rare' | 'present' | 'frequent' | 'dominant'

export type CatalogPlant = {
  key: string
  name: string
  latin: string
  indicates: SoilIndicatorKey[]
  note: string
  provenance: string
}

export type BioObservation = {
  id: number
  speciesName: string
  latinName: string | null
  catalogKey: string | null
  plantSpeciesId: number | null
  abundance: Abundance
  observedOn: string | null
  lng: number | null
  lat: number | null
  notes: string | null
  indicators: SoilIndicatorKey[]
  note: string | null
  provenance: string | null
  observedBy: string | null
}

export type IndicatorTally = { key: SoilIndicatorKey; score: number; plants: string[] }

export type BioObservationsResponse = {
  observations: BioObservation[]
  summary: IndicatorTally[]
  catalog: CatalogPlant[]
  plantCatalog: boolean
}

export type PlantSuggestion = { id: number; name: string; latin: string | null }
