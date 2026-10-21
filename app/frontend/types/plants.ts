// Plant catalogue, palette, patches, plant list and coherence alerts.
// Shapes mirror the JSON of PlantSpecies#summary_json / #sheet_json,
// PaletteItem#as_json, PlantingState, PlantList and PlantingAlerts.

import type { SoilIndicatorKey } from '@/types/soil_photos'

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
  /** « proposed »: added from a palette, waiting for Semisto's review (only its author and its maps see it). */
  reviewStatus?: 'proposed' | 'reviewed' | 'rejected'
  /** Plants in the ground over every garden (catalogue search only, anonymous). */
  inGround?: number
  /** Main photo with its credit (catalogue search and sheet only). */
  photo?: SpeciesPhoto | null
  /** The cultivars the search query names (catalogue search only). */
  namedVarieties?: VarietySummary[]
}

/** A free photo of a species (PlantPhoto#as_json), always shown with its credit. */
export type SpeciesPhoto = {
  url: string
  cardUrl: string
  author: string | null
  license: string
  licenseUrl: string | null
  pageUrl: string
  source: 'wikimedia_commons'
  width: number | null
  height: number | null
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
  uses: ('fresh' | 'cooking' | 'juice' | 'cider' | 'drying')[]
  pickingMonth: number | null
  eatingFromMonth: number | null
  eatingUntilMonth: number | null
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
  /** Plants in the ground: planted, or with an observation. */
  plants: number
  gardens: number
  /** Plants with at least one observation; the counts below are theirs. */
  observed: number
  established: number
  struggling: number
  dead: number
  survivalRate: number | null
  averageVigor: number | null
}

/** The species' plant points on the maps the viewer can open. */
export type SpeciesPlantings = {
  points: { id: number; mapId: number; lng: number; lat: number; inGround: boolean; plantedOn: string | null; plantedPrecision?: string | null; variety: string | null }[]
  maps: { id: number; name: string; inGround: number; planned: number }[]
  inGround: number
  planned: number
  truncated: boolean
}

/** A place whose owners show this species in the ground (« Dans d'autres jardins »). */
export type SharedPlace = {
  id: number
  region: string | null
  /** Rounded to 5 km, from the person's nearest map (`nearMap`). */
  distanceKm: number | null
  nearMap: string | null
  acceptsRequests: boolean
  plants: { varietyId: number | null; variety: string | null; count: number; since: number | null; requested: boolean }[]
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
  /** A draft naming a cultivar the catalogue doesn't know yet: created when accepted. */
  newVariety?: boolean
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
  status?: 'active' | 'draft'
  source?: 'human' | 'ai'
  rationale?: string | null
}

/** A palette entry an AI proposed, waiting for a human (no counters yet). */
export type PaletteDraft = Omit<PaletteItem, 'planned' | 'placed' | 'planted'>

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
export type AlertRule = 'density' | 'exposure' | 'hardiness' | 'invasive' | 'nitrogen' | 'strata' | 'pollination' | 'unknown'

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
  /** Proposed by an AI through the MCP, accepted or refused in « Palette ». */
  paletteDrafts?: PaletteDraft[]
  species: Record<string, SpeciesSummary>
  varieties: Record<string, VarietySummary>
  patches: Record<string, PatchState>
  strata: Record<Strata, number>
  list: PlantListData
  alerts: PlantingAlerts
  /** Support trees and shrubs against productive ones, years 1, 5, 15 and 30 (SuccessionBalance). */
  succession?: SuccessionBalanceData
}

export type SuccessionYear = { year: number; calendarYear: number; support: number; productive: number; share: number | null }

export type SuccessionAction =
  | { key: 'chop_and_drop'; count: number }
  | { key: 'give_way'; count: number; year: number }
  | { key: 'unscheduled'; count: number }

export type SuccessionBalanceData = {
  origin: string
  years: SuccessionYear[]
  supportTotal: number
  productiveTotal: number
  actions: SuccessionAction[]
  advice: ('no_support' | 'few_support' | 'support_stays')[]
}

export type FitStatus = 'fits' | 'partial' | 'misfit' | 'unknown'
export type FitCriterionKey = 'hardiness' | 'exposure' | 'moisture' | 'soil_type' | 'ph'
export type FitTier = 'fits' | 'unknowns' | 'one_misfit' | 'misfits'

/** One verdict of PlantFit: never a score, and « unknown » when the catalogue is silent. */
export type FitCriterion = {
  key: FitCriterionKey
  status: FitStatus
  /** What the site says: vocabulary keys, or the zone number for hardiness. */
  site: (string | number)[]
  /** The catalogue value was checked against a source. */
  verified: boolean
}

export type PlantFit = { tier: FitTier; criteria: FitCriterion[] }

/** A known fact that rules a species out on this land (PlantFit::Site#excluded_by). */
export type FitExclusion = 'hardiness' | 'invasive' | 'toxic'

export type SiteSignalOrigin = 'climate' | 'patches' | 'sheet' | 'soil_samples'

/** What the map tells about its growing conditions (PlantFit::Site). */
export type SiteProfile = {
  signals: Partial<Record<FitCriterionKey, { values: (string | number)[]; origin: SiteSignalOrigin }>>
  toxicFor: string[]
  country: string | null
}

export type PaletteSuggestion = SpeciesSummary & { reason: string; fit?: PlantFit }

export type PaletteSuggestions = {
  suggestions: PaletteSuggestion[]
  zone: number | null
  site: SiteProfile
  excluded: { hardiness: number; invasive: number; toxic: number }
}

export const PLANT_OBSERVATION_KINDS = ['follow_up', 'flowering', 'pruning', 'damage', 'disease', 'intervention', 'other'] as const
export type PlantObservationKind = (typeof PLANT_OBSERVATION_KINDS)[number]

export type PlantObservation = {
  id: number
  featureId: number
  observedOn: string
  kind: PlantObservationKind
  /** Whether it took: always on a follow-up entry, optional on the others. */
  survival: 'established' | 'struggling' | 'dead' | null
  vigor: number | null
  note: string | null
  author: string | null
  photoUrl: string | null
  thumbUrl?: string | null
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
  /** The entry of the bio-indicator list (what the plant says about the soil); null when the list does not have it. */
  bioindicator: { key: string; name: string; latin: string; indicates: SoilIndicatorKey[]; unverified: SoilIndicatorKey[] } | null
}

export type PlantIdentificationResponse = {
  available: boolean
  candidates: PlantIdentificationCandidate[]
  credit: string
}
