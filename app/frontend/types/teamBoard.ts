import type { TeamRole, ListedMap } from '@/types/teams'

export type BoardPhase = 'request' | 'offer' | 'design' | 'implementation' | 'co_management' | 'completed'
export type ClosedReason = 'declined' | 'no_reply' | 'other'
export type StepKind = 'design' | 'site' | 'plant'
export type RequestStatus = 'new' | 'called' | 'visited' | 'offer_sent'

export type BoardPerson = { id: number; name: string; avatarUrl: string | null }

/** A team map on the board (Teams::Board#project_json). */
export type BoardProject = ListedMap & {
  phase: BoardPhase
  phaseChangedAt: string
  lead: BoardPerson | null
  crew: BoardPerson[]
  promisedOn: string | null
  promisedWhat: string | null
  onHoldSince: string | null
  closedAt: string | null
  closedReason: ClosedReason | null
  closedNote: string | null
  nextStep: { id: number; title: string; dueOn: string; assignee: BoardPerson | null } | null
  overdueTasks: number
}

/** A request of the team's form nobody has turned into a map yet. */
export type BoardRequest = {
  id: number
  formId: number
  name: string
  email: string
  phone: string | null
  address: string | null
  areaM2: number | null
  message: string | null
  answers: { profile?: string; services?: string[]; budget?: string; water?: string; source?: string[] }
  status: RequestStatus
  createdAt: string
  photos: number
  boundary: GeoJSON.Geometry | null
  center: [number, number] | null
}

/** A season step: design, work site or planting, from one date to another. */
export type BoardStep = { id: number; mapId: number; kind: StepKind; title: string; startsOn: string; dueOn: string; done: boolean }

export type BoardMemberLoad = BoardPerson & {
  you: boolean
  /** The projects (still followed) this person manages or works on. */
  projects: number[]
  tasksSoon: number
  overdue: number
}

export type TeamBoardProps = {
  team: { id: number; name: string; role: TeamRole }
  today: string
  season: { opensOn: string; closesOn: string; inSeason: boolean; weeks: number }
  requestForm: { id: number; slug: string; active: boolean } | null
  requests: BoardRequest[]
  phases: BoardPhase[]
  closedReasons: ClosedReason[]
  stepKinds: StepKind[]
  members: (BoardPerson & { you: boolean })[]
  projects: BoardProject[]
  steps: BoardStep[]
  people: BoardMemberLoad[]
}
