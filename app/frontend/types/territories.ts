import type { Feature, Geometry, MultiPolygon } from 'geojson'
import type { BBox, LngLat, RegionData, RegionLayerData } from '@/types'

export type TerritoryItemKind = 'actor' | 'source' | 'expectation' | 'marker' | 'lead'
export type TerritoryItemStatus = 'draft' | 'active' | 'rejected'
export type Proof = 'computed' | 'seen' | 'confirmed'
export type LeadRank = 'soil' | 'slow' | 'structure'
export type LeadTheme = 'water' | 'tree'
export type LandType = 'public' | 'agricultural' | 'private' | 'unknown'
export type FarmerAnswer = 'yes' | 'no' | 'thinking'
export type LeadDecision = 'retained' | 'postponed' | 'dismissed'

/** The `properties` of a dossier entry; each kind keeps its own keys (TerritoryItem::SCHEMA). */
export type TerritoryItemProperties = {
  organization?: string
  function?: string
  met_on?: string
  contact?: string
  url?: string
  author?: string
  published_on?: string
  excerpts?: string
  rights?: 'open' | 'restricted' | 'unknown'
  source_kind?: string
  year?: number
  source_ids?: number[]
  validated?: boolean
  occurred_on?: string
  proof?: Proof
  marker_kind?: string
  rank?: LeadRank
  theme?: LeadTheme
  land?: LandType
  magnitude?: string
  expectation_ids?: number[]
  seen_on_site?: boolean
  seen_on?: string
  farmer?: { contacted_on?: string; answer?: FarmerAnswer; note?: string }
  keeper?: { role?: string; gestures?: string; hours_per_year?: number; agreement?: string; lifespan_years?: number }
  decision?: { status?: LeadDecision; reason?: string; decided_on?: string }
  first_step?: number
  this_winter?: boolean
  map_id?: number
}

export type TerritoryItem = {
  id: number
  kind: TerritoryItemKind
  status: TerritoryItemStatus
  source: 'human' | 'ai'
  title: string
  body: string | null
  rationale: string | null
  geometry: Geometry | null
  properties: TerritoryItemProperties
  file: { name: string; byteSize: number } | null
  orphan: boolean
  sharp: boolean | null
  waitingForFarmer: boolean
  createdAt: string
  updatedAt: string
  lockVersion: number
}

export type TerritoryData = {
  id: number
  name: string
  areaM2: number
  bbox: BBox
  boundary: MultiPolygon
  center: LngLat
  teamId: number
  teamName: string
  region: RegionData | null
  boundarySource: { provider?: string; id?: string; label?: string; licence?: string }
  notebook: { intro: string; nextStep: string; nextStepBudget: string }
  archived: boolean
  createdAt: string
  updatedAt: string
}

export type ResearchTopic = { topic: string; why?: string; where?: string[] }

export type TerritoryShowProps = {
  territory: TerritoryData
  items: TerritoryItem[]
  layers: RegionLayerData[]
  teamMaps: { id: number; name: string; boundary: MultiPolygon | null; areaM2: number | null }[]
  researchGrid: ResearchTopic[]
  canEdit: boolean
  moduleGranted: boolean
}

export type TerritorySummary = {
  id: number
  name: string
  teamName: string
  areaM2: number
  boundary: MultiPolygon
  archived: boolean
  updatedAt: string
  counts: Partial<Record<TerritoryItemKind, { active: number; draft: number }>>
}

export type CommuneCandidate = { id: string; name: string; detail: string | null; lng: number; lat: number; bbox: BBox | null }

type SourceRef = { id: number; title: string; url: string | null; author: string | null; publishedOn: string | null }

export type NotebookLead = {
  id: number
  title: string
  body: string | null
  rank: LeadRank | null
  theme: LeadTheme | null
  land: LandType
  magnitude: string | null
  answers: string[]
  seenOnSite: boolean
  seenOn: string | null
  farmer: TerritoryItemProperties['farmer'] | null
  keeper: TerritoryItemProperties['keeper'] | null
  orphan: boolean
  decision: TerritoryItemProperties['decision'] | null
  sharp: boolean
  geometry?: Geometry | null
}

export type NotebookMarker = { id: number; title: string; body: string | null; occurredOn: string | null; proof: Proof; markerKind: string | null; sources: SourceRef[] }

export type NotebookProps = {
  version: 'working' | 'public'
  territory: Pick<TerritoryData, 'id' | 'name' | 'areaM2' | 'bbox' | 'boundary' | 'teamName' | 'region' | 'boundarySource'>
  intro: string
  generatedOn: string
  says: {
    actors: { id: number; title: string; body: string | null; organization: string | null; function: string | null; metOn: string | null }[]
    expectations: { id: number; title: string; body: string | null; year: number | null; validated: boolean; sources: SourceRef[] }[]
  }
  shows: { markers: NotebookMarker[] }
  seen: { markers: NotebookMarker[]; leads: { id: number; title: string; seenOn: string | null }[] }
  leads: NotebookLead[]
  hypotheses: NotebookLead[]
  waitingForFarmer: number
  firstSteps: { id: number; title: string; order: number; thisWinter: boolean }[]
  decision: { nextStep: string; budget: string }
  sources: (SourceRef & { sourceKind: string | null; rights: string })[]
  mapFeatures: Feature[]
  canEdit: boolean
  baseLayer: RegionLayerData | null
  /** The overlays a territory opens with (where water concentrates). */
  overlays: RegionLayerData[]
}
