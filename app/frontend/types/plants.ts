// Plant catalogue, palette, patches, plant list and coherence alerts.
// Shapes mirror the JSON of PlantSpecies#summary_json / #sheet_json,
// PaletteItem#as_json, PlantingState, PlantList and PlantingAlerts.

export type Strata =
  | 'canopy' | 'sub_canopy' | 'shrub' | 'herbaceous' | 'ground_cover' | 'vine' | 'root' | 'aquatic'

export const STRATA: Strata[] = ['canopy', 'sub_canopy', 'shrub', 'herbaceous', 'ground_cover', 'vine', 'root', 'aquatic']

export type ProvenanceStatus = 'sourced' | 'to_verify' | 'empty'

export type Provenance = {
  source: string
  upstreamSource: string | null
  license: string | null
  url: string | null
  status: ProvenanceStatus
  updatedAt: string | null
}

export type SpeciesSummary = {
  id: number
  latinName: string
  commonName: string | null
  slug: string
  plantType: string | null
  strata: Strata
  foliageType: string | null
  heightMaxM: number | null
  spreadMaxM: number | null
  /** Adult crown diameter used on the map (m). */
  crownM: number
  /** True when the crown is the strata default (species spread unknown). */
  crownIndicative: boolean
  hardinessZone: number | null
  minTemperatureC: number | null
  exposures: string[]
  soilMoisture: string[]
  edibleParts: string[]
  ecoServices: string[]
  edibleRating: number | null
  nativeCountries: string[]
  invasiveCountries: string[]
  harvestMonths: number[]
}

export type VarietySummary = {
  id: number
  speciesId: number
  name: string
  latinName: string
  commonName: string | null
}

export type VarietySheet = VarietySummary & {
  fertility: string | null
  tasteRating: number | null
  productivity: string | null
  ripening: string | null
  diseaseResistance: string | null
  maturityYears: number | null
  productionStartYear: number | null
  provenance: Record<string, Provenance>
}

export type SpeciesSheet = SpeciesSummary & {
  genus: string | null
  commonNames: string[]
  lifeCycle: string | null
  growthRate: string | null
  rootSystem: string | null
  fertility: string | null
  heightMinM: number | null
  spreadMinM: number | null
  soilTypes: string[]
  soilPh: string[]
  soilRichness: string | null
  wateringNeed: number | null
  medicinalRating: number | null
  floweringMonths: number[]
  fruitingMonths: number[]
  pruningMonths: number[]
  toxicFor: string[]
  maturityYears: number | null
  productionStartYear: number | null
  provenance: Record<string, Provenance>
  varieties: VarietySheet[]
}

export type ObservationStats = {
  plants: number
  gardens: number
  established: number
  struggling: number
  dead: number
  survivalRate: number
  averageVigor: number | null
}

export type PlantSearchFilters = {
  q: string | null
  zone: number | null
  strata: string[]
  plant_type: string[]
  exposures: string[]
  soil_moisture: string[]
  edible: boolean
  nitrogen: boolean
  mellifere: boolean
  native: boolean
  no_invasive: boolean
}

export type PlantSearchResult = {
  results: SpeciesSummary[]
  total: number
  page: number
  pages: number
  perPage: number
  filters: PlantSearchFilters
}

export type CatalogueRegion = { name: string; country: string; zone: number | null }

export type PaletteRole = 'food' | 'support' | 'pioneer' | 'hedge' | 'ornamental'

export type PaletteItem = {
  id: number
  speciesId: number
  varietyId: number | null
  strata: Strata | null
  effectiveStrata: Strata
  role: PaletteRole | null
  notes: string | null
  targetCount: number | null
  position: number
  name: string
  latinName: string
  species: SpeciesSummary
  variety: VarietySummary | null
  planned: number
  placed: number
  planted: number
}

export type PatchLine = {
  id: number
  featureId: number
  speciesId: number
  varietyId: number | null
  strata: Strata | null
  density: number | null
  count: number | null
  position: number
  effectiveStrata: Strata
  effectiveDensity: number | null
  defaultDensity: number
  densityRange: [number, number] | null
  quantity: number
}

export type PatchState = { areaM2: number | null; total: number; items: PatchLine[] }

export type PlantListRow = {
  speciesId: number
  varietyId: number | null
  latinName: string
  commonName: string | null
  varietyName: string | null
  strata: Strata
  isolated: number
  composed: number
  total: number
  placed: number
  planted: number
  patches: number
  heightM: number
  spreadM: number
}

export type PlantListData = {
  rows: PlantListRow[]
  total: number
  speciesCount: number
  lines: number
  planted: number
  placed: number
  unlinked: number
}

export type AlertLevel = 'blocking' | 'warning' | 'info'
export type AlertRule = 'density' | 'exposure' | 'hardiness' | 'invasive' | 'nitrogen' | 'strata' | 'pollination'

export type PlantingAlert = {
  level: AlertLevel
  rule: AlertRule
  message: string
  featureId: number | null
  speciesId: number | null
}

export type PlantingAlerts = {
  alerts: PlantingAlert[]
  counts: Partial<Record<AlertLevel, number>>
  zone: number | null
}

export type PlantingState = {
  zone: number | null
  minTemperatureC: number | null
  country: string | null
  palette: PaletteItem[]
  species: Record<string, SpeciesSummary>
  varieties: Record<string, VarietySummary>
  patches: Record<string, PatchState>
  strata: Record<Strata, number>
  list: PlantListData
  alerts: PlantingAlerts
}

export type PaletteSuggestion = SpeciesSummary & { reason: string }

export type PlantObservation = {
  id: number
  featureId: number
  observedOn: string
  survival: 'established' | 'struggling' | 'dead'
  vigor: number | null
  note: string | null
  author: string | null
  photoUrl: string | null
  createdAt: string | null
}

/** One candidate species of POST /maps/:id/plant_identifications (PlantIdentification::Candidate). */
export type PlantIdentificationCandidate = {
  latinName: string
  authorship: string | null
  commonNames: string[]
  family: string | null
  /** 0..1 */
  score: number
  percent: number
  /** The matching catalogue species; null when the catalogue does not know it yet. */
  species: { id: number; latinName: string; commonName: string | null; slug: string } | null
}

export type PlantIdentificationResponse = {
  available: boolean
  candidates: PlantIdentificationCandidate[]
  credit: string
}
