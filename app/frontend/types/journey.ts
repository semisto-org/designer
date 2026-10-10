import type { MapStage } from '@/types'

// ----- Typed schema (served by the server: ProjectSheet.schema_json) -----

export type SchemaFieldType = 'text' | 'enum' | 'multi' | 'integer' | 'boolean' | 'list'

export type SchemaField = {
  key: string
  type: SchemaFieldType
  counts: boolean
  values?: string[]
  range?: [number, number]
  limit?: number
  max?: number
  exclusive?: string[]
  item?: SchemaField[]
  required?: boolean
  hidden?: boolean
}

export type ProjectSchema = { sections: { key: string; fields: SchemaField[] }[] }

// ----- Project sheet -----

export type SectionValues = Record<string, unknown>
export type ProjectMeta = { done?: string[]; touched?: Record<string, string> }
/** maps.project: sections of answers, plus `meta`. */
export type ProjectData = { [section: string]: SectionValues | undefined } & { meta?: ProjectMeta }

export type SectionStatus = 'empty' | 'partial' | 'complete'
export type SectionProgress = {
  percent: number
  answered: number
  total: number
  done: boolean
  status: SectionStatus
  touchedAt: string | null
}
export type ProjectProgress = {
  percent: number
  sections: Record<string, SectionProgress>
  nextSection: string | null
}

/** An answer an AI proposed for one field (MCP propose_project_sheet). */
export type ProjectDraft = {
  id: number
  section: string
  field: string
  value: unknown
  rationale: string
  author: string | null
  clientName: string | null
  createdAt: string
}

export type ProjectPayload = {
  map: { id: number; name: string; role: string | null; address: string | null }
  project: ProjectData
  progress: ProjectProgress
  schema: ProjectSchema
  drafts: ProjectDraft[]
  canEdit: boolean
  /** The private link for the people behind the project (editors only). */
  formLink: ProjectFormLink | null
}

export type ProjectFormLink = {
  url: string
  enabled: boolean
  openedAt: string | null
  submittedAt: string | null
  createdAt: string | null
}

/** The form opened from the private link (/fiche-projet/:token). */
export type ProjectFormPayload = {
  token: string
  mapName: string
  invitedBy: string
  project: ProjectData
  progress: ProjectProgress
  schema: ProjectSchema
  canEdit: boolean
  submittedAt: string | null
}

// ----- Journey -----

export type JourneyItem = {
  key: string
  step: MapStage
  done: boolean
  panel: string
  progress?: number
  count?: number
  target?: number
  client?: boolean
}

export type JourneyStep = {
  key: MapStage
  current: boolean
  done: boolean
  completed: number
  total: number
  items: JourneyItem[]
}

export type JourneyNext =
  | { type: 'item'; step: MapStage; item: string; panel: string }
  | { type: 'advance'; stage: MapStage }
  | { type: 'complete' }

export type JourneyData = {
  stage: MapStage
  stageIndex: number
  steps: JourneyStep[]
  next: JourneyNext
}

// ----- Requests to Semisto -----

export type RequestKind = 'order_plants' | 'implementation' | 'co_management'
export type RequestStatus = 'new' | 'contacted' | 'closed'

export type ServiceRequestSummary = {
  id: number
  kind: RequestKind
  status: RequestStatus
  createdAt: string
  contactedAt?: string
  closedAt?: string
}

export type PlantLine = { name: string; quantity?: number; species_id?: number; note?: string }

export type RequestPrefill = {
  plants: PlantLine[]
  plantsSource: 'plant_list' | 'features' | null
  surfaceM2: number | null
  address: string | null
  commune: string | null
}

export type RequestsData = {
  requests: ServiceRequestSummary[]
  canCreate: boolean
  prefill?: RequestPrefill
  schema?: Record<RequestKind, SchemaField[]>
}

export type AdminRequest = ServiceRequestSummary & {
  payload: Record<string, unknown>
  snapshot: {
    map_name?: string
    area_m2?: number | null
    address?: string | null
    plants_count?: number
    project_percent?: number
    stage?: string
    owner_name?: string
  }
  adminNotes: string | null
  contactConsent: boolean
  user: { id: number; name: string; email: string }
  handledBy: string | null
  map: { id: number; name: string; address: string | null; areaM2: number | null; archived: boolean }
}
