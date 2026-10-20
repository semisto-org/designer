/** The implementation plan of a map, as Implementation::Plan#as_json gives it. */

export type Advice =
  | { code: 'season'; season: 'dry' | 'dormant' | 'spring'; count: number }
  | { code: 'machine'; count: number }
  | { code: 'time'; weeks: number; available: number }
  | { code: 'availability'; seasons: string[] }
  | { code: 'drawn_as_existing'; count: number }
  | { code: 'budget'; costCents: number; capCents: number }

export type WorkGroup = {
  key: string
  kind: string
  layer: string
  label: string | null
  names: string[]
  count: number
  done: number
  featureIds: number[]
  quantity: number
  per: 'each' | 'm' | 'm2'
  hours: number
  machine: boolean
  unknown: boolean
  season: string
}

export type Hours = { estimated: number; total: number; unestimated: number; machine: number }

export type Phase = {
  id: number
  name: string
  key: string | null
  startsOn: string
  endsOn: string
  notes: string | null
  hoursOverride: number | null
  otherCostsCents: number | null
  lockVersion: number
  groups: WorkGroup[]
  hours: Hours
  plantsCostCents: number
  unpricedPlants: number
  costCents: number
  done: number
  count: number
  available: { perWeek: number; hours: number } | null
  advice: Advice[]
}

/** A phase an AI proposed, waiting for a human (Mcp::Tools::ProposePhases). */
export type DraftPhase = {
  id: number
  name: string
  startsOn: string
  endsOn: string
  notes: string | null
  rationale: string | null
  source: string
  groups: WorkGroup[]
  hours: Hours
  costCents: number
}

export type ImplementationPlan = {
  phases: Phase[]
  drafts: DraftPhase[]
  unassigned: { groups: WorkGroup[]; hours: Hours }
  drawnAsExisting: number[]
  sheet: {
    hoursPerWeek: number | null
    seasons: string[]
    help: string[]
    budgetInitial: string | null
    budgetYearly: string | null
    startYear: number | null
    phasing: string | null
  }
  totals: { hours: number; costCents: number; done: number; count: number }
  advice: Advice[]
}
