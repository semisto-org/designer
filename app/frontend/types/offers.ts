// The offer builder (pages/maps/offers): inputs edited by the team, the
// map's measures and the computed budget (Offer::Inputs, Offer::Measures,
// Offer::Estimator). Inputs keep the server's snake_case keys: they go
// back to the server as they are.

export type Phase = 'pre_design' | 'design' | 'implementation'
export type AdjustmentPhase = 'all' | Phase

export type OfferSettings = {
  designers: number
  hourly_rate: number
  contribution_pct: number
  buffer_pct: number
  km_rate: number
  plants_per_day: number
  plants_margin_pct: number
  vat_services_pct: number
  vat_plants_pct: number
  vat_supplies_pct: number
  rounding: number
  co_management_half_days: number
  half_day_hours: number
}

export type ScopeInput = {
  id: string
  feature_id: number | null
  label: string | null
  planting_type: string
  measure: number | null
  plants_override: number | null
  option: boolean
}

export type TripInput = { id: string; phase: Phase; label: string | null; trips: number | null; one_way_km: number | null }

export type LineOverride = { key: string; persons: number | null; hours: number | null; amount: number | null; disabled: boolean }

export type CustomLineInput = {
  id: string
  phase: Phase
  kind: 'hours' | 'amount'
  label: string | null
  persons: number | null
  hours: number | null
  amount: number | null
  option: boolean
}

export type AdjustmentInput = { id: string; preset: string | null; label: string | null; pct: number; phase: AdjustmentPhase }

export type OfferInputs = {
  settings: OfferSettings
  services: Record<string, boolean>
  complexity: Record<string, number>
  scope: ScopeInput[]
  trips: TripInput[]
  lines: LineOverride[]
  custom_lines: CustomLineInput[]
  adjustments: AdjustmentInput[]
  prices: Partial<Record<Phase, { fees?: number; expenses?: number }>>
  plant_prices: Record<string, number>
  notes: string | null
}

export type PlantingType = { key: string; label: string | null; measure: 'area' | 'length'; mix: Record<string, number> }
export type PlantCategory = { key: string; label: string | null; price: number; mulch_m2: number; compost_l: number; guard: number; stake: number }
export type ComplexityCriterion = { key: string; label: string | null; max: number }
export type ComplexityLevel = { key: string; label: string | null; up_to: number; factor: number }
export type OfferTerms = { revisions: number | null; validity_days: number | null; deposit_pct: number | null; markup_label?: string | null; exclusions: string | null; assumptions: string | null }

/** What the offer page needs of its pricing (Offer::Pricing). */
export type PricingInfo = {
  name: string | null
  settings: OfferSettings
  categories: PlantCategory[]
  plantingTypes: PlantingType[]
  complexity: { criteria: ComplexityCriterion[]; levels: ComplexityLevel[] }
  targetDesignSharePct: number
  terms: OfferTerms
}

export type OfferData = {
  inputs: OfferInputs
  lockVersion: number
  persisted: boolean
  templateId: number | null
  pricing: PricingInfo
  updatedAt: string | null
  updatedBy: string | null
}

export type Candidate = { id: number; name: string | null; kind: string; layer: string; measure_kind: 'area' | 'length'; measure: number }

export type ScopeMeasure = {
  id: string
  feature_id: number | null
  missing: boolean
  label: string | null
  kind: string | null
  planting_type: string
  measure_kind: 'area' | 'length'
  measure: number
  plants: Record<string, number>
  plants_total: number
  option: boolean
}

export type OfferMeasures = {
  site_area_m2: number | null
  scope: ScopeMeasure[]
  drivers: Record<string, number>
  services: Record<string, boolean>
  suggestions: Record<string, string>
  adjustment_hints: Record<string, string>
  budget_ceiling: number | null
  lead_name: string | null
  client_type?: string | null
  candidates?: Candidate[]
}

export type Formula = { base: number; per: number; driver: string | null; value: number | null }

export type BudgetLine = {
  key: string
  kind: 'task' | 'expense' | 'trip' | 'custom'
  task?: string
  id?: string
  label?: string | null
  persons?: number
  hours?: number
  computed_hours_without?: number
  gain_pct?: number
  rate?: number
  amount: number
  computed_persons?: number
  computed_hours?: number
  computed_amount?: number
  overridden?: boolean
  option: boolean
  disabled: boolean
  formula?: Formula
  trips?: number | null
  one_way_km?: number | null
  km?: number
}

export type PhaseResult = {
  key: Phase
  lines: BudgetLine[]
  expenses: BudgetLine[]
  hours_min: number
  hours_max: number
  labour_base: number
  labour_options: number
  adjustment_pct: number
  factor: number
  fees_min: number
  fees_max: number
  expenses_min: number
  expenses_max: number
  total_min: number
  total_max: number
  total_min_tvac: number
  total_max_tvac: number
  computed_prices: { fees: number; expenses: number }
  prices: { fees: number; expenses: number }
  prices_set: ('fees' | 'expenses')[]
  price_tvac: number
  hours_saved: number
  saved_tvac: number
}

export type PlantsResult = {
  categories: { key: string; label: string | null; price: number; base: number; option: number; amount_base: number; amount_option: number }[]
  supplies: { key: string; unit_price: number; base: number; option: number; amount_base: number; amount_option: number }[]
  small_material: number
  count_base: number
  count_option: number
  plants_base: number
  plants_max: number
  supplies_base: number
  supplies_max: number
  plants_base_tvac: number
  plants_max_tvac: number
  supplies_base_tvac: number
  supplies_max_tvac: number
}

export type OfferWarning = { code: string; label?: string; phase?: Phase; part?: string; ceiling?: number; share?: number; target?: number }

/** How precise the budget is (Offer::Precision): out of 100, with what is missing, the biggest gain first. */
export type PrecisionCheck = { key: string; where: 'map' | 'sheet' | 'offer'; weight: number; done: number; points: number }
export type OfferPrecision = { score: number; level: 'rough' | 'range' | 'precise'; checks: PrecisionCheck[]; missing: string[] }

export type OfferResult = {
  phases: PhaseResult[]
  plants: PlantsResult
  co_management: { half_days: number; hours: number; amount_htva: number; amount_tvac: number }
  complexity: { points: number | null; max: number; level: string | null; factor: number }
  target_design_share_pct: number
  totals: {
    design_tvac: number
    implementation_tvac: number
    design_share_pct: number | null
    saved_tvac: number
    services_min: number
    services_max: number
    services_price_tvac: number
    services_max_tvac: number
    plants_supplies_base_tvac: number
    plants_supplies_max_tvac: number
    total_tvac: number
    total_max_tvac: number
  }
  regie_rate_tvac: number
  warnings: OfferWarning[]
  precision: OfferPrecision
}

export type OfferVersionSummary = {
  number: number
  label: string
  status: 'saved' | 'sent' | 'accepted' | 'declined'
  note: string | null
  createdAt: string
  createdBy: string | null
  pricingName: string | null
  totalTvac: number | null
  totalMaxTvac: number | null
}

export type OfferCatalog = {
  phases: Phase[]
  services: string[]
  adjustmentPresets: { key: string; pct: number; phase: AdjustmentPhase }[]
}

export type OfferMap = { id: number; name: string; address: string | null; areaM2: number | null; role?: string }

export type OfferPageProps = {
  map: OfferMap
  team: { name: string; member: boolean } | null
  canUseOffers: boolean
  unavailableReason?: 'not_member' | 'no_plan' | 'not_owner' | null
  templates?: { id: number; name: string; clientTypes: string[] }[]
  offer?: OfferData
  measures?: OfferMeasures
  result?: OfferResult
  versions?: OfferVersionSummary[]
  catalog?: OfferCatalog
  canEdit?: boolean
}

export type OfferVersionPageProps = {
  map: OfferMap
  team: { name: string } | null
  version: OfferVersionSummary & { inputs: OfferInputs; measures: OfferMeasures; result: OfferResult; terms: OfferTerms }
}
