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
  /** One of the team's own places (its food forest, its nursery…): off the timeline. */
  ownPlace: boolean
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
export type BoardStep = { id: number; mapId: number; kind: StepKind; title: string; startsOn: string; dueOn: string; done: boolean; forecast: boolean }

export type BoardMemberLoad = BoardPerson & {
  you: boolean
  /** The active projects (still followed, not on hold) this person manages or works on. */
  projects: number[]
  /** The projects on hold this person manages or works on: shown, not counted. */
  dormant: number[]
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
  places: BoardProject[]
  steps: BoardStep[]
  people: BoardMemberLoad[]
}

export type OfferStatus = 'saved' | 'sent' | 'accepted' | 'declined'

/** An action of a project, as the preview shows it (Teams::ProjectPreview#task_json). */
export type PreviewTask = {
  id: number
  title: string
  dueOn: string | null
  overdue: boolean
  list: string | null
  assignee: (Omit<BoardPerson, 'id'> & { id: number | null }) | null
  completedAt: string | null
  completedBy: string | null
}

/** What the team reads about a project before opening its map (Teams::ProjectPreview). */
export type ProjectPreviewData = {
  id: number
  name: string
  address: string | null
  areaM2: number | null
  phase: BoardPhase
  phaseChangedAt: string
  daysInPhase: number
  onHoldSince: string | null
  closedAt: string | null
  closedReason: ClosedReason | null
  promisedOn: string | null
  promisedWhat: string | null
  lead: BoardPerson | null
  crew: BoardPerson[]
  nextStep: PreviewTask | null
  coming: PreviewTask[]
  overdue: number
  done: PreviewTask[]
  lists: { id: number; name: string; done: number; total: number }[]
  steps: BoardStep[]
  mainGoal: string | null
  /** null when the offer builder is not shown to this person. */
  offer: { url: string; exists: boolean; version: string | null; status: OfferStatus | null; statusOn: string | null; versions: number } | null
  request: { createdAt: string; name: string } | null
  readOnly: boolean
}
