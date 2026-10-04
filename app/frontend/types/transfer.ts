// « Transférer la carte » (transfer area): Maps::TransfersController payloads.

/** Someone the owner can propose the map to (an editor, or a member of the map's team). */
export type TransferCandidate = {
  userId: number
  name: string
  /** Editors only: a team's addresses stay with its admins. */
  email: string | null
  avatarUrl: string | null
  /** Edits through the map's team, without a seat: the former owner will take a free one. */
  viaTeam: boolean
}

export type PendingTransfer = {
  id: number
  recipient: TransferCandidate
  createdAt: string
  expiresAt: string
  /** Why it cannot be accepted right now (in French), or null. */
  problem: string | null
}

/** A proposal made to me, for the map editor's header notice. */
export type IncomingTransferNotice = {
  id: number
  fromName: string
  expiresAt: string
  path: string
}

/** GET /maps/:map_id/transfers: the owner's section, or what concerns me. */
export type TransferSectionData = {
  role: 'owner' | 'editor' | 'viewer' | null
  // Owner only.
  pending?: PendingTransfer | null
  candidates?: TransferCandidate[]
  seatsLeft?: number
  viewersCount?: number
  team?: string | null
  expiresInDays?: number
  archived?: boolean
  // Everyone else.
  incoming?: IncomingTransferNotice | null
}

/** A proposal waiting for my answer, on the maps list. */
export type IncomingTransfer = {
  id: number
  mapId: number
  mapName: string
  fromName: string
  expiresAt: string
}

export type TransferState = 'pending' | 'accepted' | 'declined' | 'canceled' | 'expired' | 'invalidated'

export type PaidFeature = 'pdf_export' | 'analyses' | 'ai_drafts'

/** What taking the map over changes for the recipient's plan (MapTransfer::PlanImpact). */
export type PlanImpactData = {
  billing: boolean
  plan: string
  planName: string
  maxMaps: number
  mapReadOnly: boolean
  mapsBecomingReadOnly: { id: number; name: string }[]
  lostFeatures: PaidFeature[]
  changesAnything: boolean
}

/** Props of pages/maps/transfers/show (the recipient's screen). */
export type TransferPageProps = {
  transfer: {
    id: number
    state: TransferState
    fromName: string
    createdAt: string
    expiresAt: string
    closedAt: string | null
    problem: string | null
  }
  map: {
    id: number
    name: string
    /** False when the recipient lost access meanwhile: only the name is sent. */
    canOpen: boolean
    address?: string | null
    areaM2?: number | null
    regionName?: string
    team?: string | null
  }
  /** Only while the proposal can be accepted. */
  impact: PlanImpactData | null
}
