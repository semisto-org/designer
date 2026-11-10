export type Phase = 'commercial' | 'pre_design' | 'design' | 'implementation'
export type Reason = 'offered' | 'travel' | 'other'

export type TimeEntry = {
  id: number
  mapId: number
  mapName?: string
  userId: number
  userName: string
  workedOn: string
  minutes: number
  phase: Phase
  billable: boolean
  nonBillableReason: Reason | null
  note: string | null
  billTo: string | null
  tripKm: number | null
  tripFrom: string | null
  tripTo: string | null
  status: 'noted' | 'invoiced'
  invoicedAt: string | null
  invoiceNumber: string | null
  source: 'web' | 'mcp' | 'app'
}

/** A project the person may note time on, with what the form fills in. */
export type ProjectChoice = {
  id: number
  name: string
  teamName: string | null
  defaultPhase: Phase
  billTo: string | null
  usualTrip: { km: number; from: string | null; to: string | null } | null
}

export type Catalog = { phases: Phase[]; reasons: Reason[]; stepMinutes: number }

export type PhaseEnvelope = {
  key: Phase
  enabledInOffer: boolean | null
  envelopeHours: number | null
  envelopeKm: number | null
  hours: number
  billableHours: number
  nonBillableHours: number
  invoicedHours: number
  km: number
  overHours: number | null
  usedPct: number | null
}

export type Envelopes = {
  version: { number: number; label: string; createdAt: string } | null
  phases: PhaseEnvelope[]
  totals: { hours: number; billableHours: number; nonBillableHours: number; km: number; envelopeHours: number | null; envelopeKm: number | null }
  people: { userId: number; name: string; hours: number; billableHours: number; km: number; trips: number; byPhase: Record<Phase, number> }[]
}
