import type { Feature, Geometry, MultiPolygon } from 'geojson'
import type { BBox, LngLat, RegionData, RegionLayerData } from '@/types'

export type TerritoryItemKind = 'actor' | 'source' | 'expectation' | 'basin' | 'marker' | 'lead' | 'request'
export type TerritoryItemStatus = 'draft' | 'active' | 'rejected'
export type Proof = 'computed' | 'seen' | 'confirmed'
export type LeadRank = 'soil' | 'slow' | 'structure'
export type LeadTheme = 'water' | 'tree'
export type LandType = 'public' | 'agricultural' | 'private' | 'unknown'
export type FarmerAnswer = 'yes' | 'no' | 'thinking'
export type LeadDecision = 'retained' | 'postponed' | 'dismissed'
/** « vu au bureau », « confirmé par un acteur », « vu sur place » (TerritoryItem::VERIFICATIONS). */
export type VerificationLevel = 'desk' | 'actor' | 'site'
export type Verification = { level: VerificationLevel; by: string | null; on: string | null }

/** The `properties` of a dossier entry; each kind keeps its own keys (TerritoryItem::SCHEMA). */
export type TerritoryItemProperties = {
  organization?: string
  function?: string
  met_on?: string
  contact?: string
  url?: string
  author?: string
  published_on?: string
  excerpts?: string[]
  rights?: 'open' | 'restricted' | 'unknown'
  source_kind?: string
  year?: number
  source_ids?: number[]
  validated?: boolean
  order?: number
  outlet?: string
  basin_id?: number
  occurred_on?: string
  occurred_precision?: 'day' | 'month' | 'season' | 'year'
  paris_sector_ids?: string[]
  area_km2?: number
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
  request_kind?: 'document' | 'info'
  from?: string
  actor_id?: number
  state?: 'to_ask' | 'asked' | 'received' | 'refused'
  asked_on?: string
  received_on?: string
  source_id?: number
  verification?: VerificationLevel
  verified_by_id?: number
  verified_by?: string
  verified_on?: string
  confirm_with_id?: number
  confirm_question?: string
}

/** A change an AI proposed to a kept entry, field by field (`properties.keeper.role`), or its removal. */
export type TerritoryItemUpdate = {
  id: number
  rationale: string
  deletion: boolean
  clientName: string | null
  authorName: string | null
  changes: { field: string; before: unknown; after: unknown }[]
  createdAt: string
  /** A removal that waits for these entries to be kept. */
  supersededBy?: { id: number; title?: string; status: 'draft' | 'active' | 'rejected' | 'removed' }[]
  blocked?: boolean
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
  /** Null for actors, sources and requests, which make no claim about the land. */
  verification: VerificationLevel | null
  orphan: boolean
  sharp: boolean | null
  waitingForFarmer: boolean
  pendingUpdate: TerritoryItemUpdate | null
  createdAt: string
  updatedAt: string
  lockVersion: number
  occurredLabel?: string | null
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
  relief: TerritoryReliefState
  verification: VerificationCounts
}

export type VerificationCounts = { waiting: number; toVisit: number; unassigned: number; confirmed: number; seen: number; desk: number }

/** Where the commune's relief stands (Relief::TerritoryRelief, read by the AI's catchments). */
export type TerritoryReliefState = {
  status: 'none' | 'queued' | 'running' | 'stalled' | 'retrying' | 'failed' | 'ready'
  progress?: number
  error?: string
  attempts?: number
  max_attempts?: number
  retry_at?: string
  cell_size_m?: number
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

export type NotebookBasin = {
  id: number
  title: string
  body: string | null
  order: number | null
  outlet: string | null
  areaKm2: number | null
  seenMarkers: number
  leads: number
}

export type NotebookLead = {
  id: number
  title: string
  body: string | null
  basinId: number | null
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
  verification: Verification
  geometry?: Geometry | null
}

export type NotebookMarker = { id: number; title: string; body: string | null; basinId: number | null; occurredOn: string | null; proof: Proof; markerKind: string | null; sources: SourceRef[]; verification: Verification }

export type NotebookProps = {
  version: 'working' | 'public'
  territory: Pick<TerritoryData, 'id' | 'name' | 'areaM2' | 'bbox' | 'boundary' | 'teamName' | 'region' | 'boundarySource'>
  intro: string
  generatedOn: string
  says: {
    actors: { id: number; title: string; body: string | null; organization: string | null; function: string | null; metOn: string | null }[]
    expectations: { id: number; title: string; body: string | null; year: number | null; validated: boolean; sources: SourceRef[] }[]
  }
  basins: NotebookBasin[]
  shows: { markers: NotebookMarker[] }
  seen: { markers: NotebookMarker[]; leads: { id: number; title: string; seenOn: string | null }[] }
  leads: NotebookLead[]
  hypotheses: NotebookLead[]
  waitingForFarmer: number
  /** Entries waiting for an actor's opinion (working version only). */
  toConfirm: number
  firstSteps: { id: number; title: string; order: number; thisWinter: boolean }[]
  decision: { nextStep: string; budget: string }
  sources: (SourceRef & { sourceKind: string | null; rights: string })[]
  mapFeatures: Feature[]
  canEdit: boolean
  baseLayer: RegionLayerData | null
  /** The overlays a territory opens with (where water concentrates). */
  overlays: RegionLayerData[]
}

export type ConfirmationActor = { id: number; title: string; organization: string | null; function: string | null; contact: string | null; metOn: string | null }

export type ConfirmationEntry = {
  id: number
  kind: 'lead' | 'marker' | 'expectation' | 'basin'
  title: string
  body: string | null
  question: string | null
  level: VerificationLevel
  basin: string | null
  land?: LandType | null
  occurredLabel?: string | null
  /** [lng, lat] of a point on it, to find it on site. */
  point: [number, number] | null
  lockVersion: number
}

export type ConfirmationsProps = {
  territory: Pick<TerritoryData, 'id' | 'name' | 'teamName' | 'areaM2'>
  generatedOn: string
  actorId: number | null
  byActor: { actor: ConfirmationActor; items: ConfirmationEntry[] }[]
  toVisit: ConfirmationEntry[]
  unassigned: ConfirmationEntry[]
  actors: ConfirmationActor[]
  counts: VerificationCounts
  canEdit: boolean
  theme: import('@/types/documentThemes').DocumentTheme
}
