import type { CurrentUser, MapData, MapStage } from '@/types'
import type { MapSketchData } from '@/types/myMaps'

export type TeamRole = 'admin' | 'member'

/** The shared `currentUser` prop, with the number of teams the user belongs to. */
export type TeamAwareUser = CurrentUser & { teamsCount?: number }

/** A team in the "Mes équipes" list. */
export type TeamSummary = {
  id: number
  name: string
  role: TeamRole
  membersCount: number
  mapsCount: number
}

export type TeamMember = {
  /** The membership id (routes: /teams/:team_id/memberships/:id). */
  id: number
  userId: number
  name: string
  avatarUrl: string | null
  /** Only admins see e-mail addresses. */
  email: string | null
  role: TeamRole
  you: boolean
  /** Maps of the team owned by this member. */
  mapsCount: number
  /** The only admin: cannot leave, be removed or demoted. */
  lastAdmin: boolean
}

export type TeamInvitation = {
  id: number
  email: string
  role: TeamRole
  expiresAt: string | null
  sentAt: string | null
}

export type TeamMap = {
  id: number
  name: string
  address: string | null
  regionName: string
  ownerName: string
  ownedByYou: boolean
  ownerInTeam: boolean
  areaM2: number | null
  stage: MapStage
  updatedAt: string
}

export type TeamPageProps = {
  team: { id: number; name: string; role: TeamRole; createdAt: string }
  members: TeamMember[]
  maps: TeamMap[]
  maxNameLength: number
  /** Admins only. */
  invitations?: TeamInvitation[]
}

/** A map of the "Mes cartes" list, with its team (maps controller). */
export type ListedMap = MapData & { teamId?: number | null; sketch?: MapSketchData }

