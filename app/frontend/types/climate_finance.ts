// Types of the climate panel (GET /maps/:id/climate, /climate/forecast)
// and of the financial dashboard (/maps/:id/finances). Mirrors
// Climate::MapReport, Climate::ForecastReport and FinancialPlan.

// ---------------------------------------------------------------- climate

export type Horizon = '2050' | '2080'
export type Scenario = 'moderate' | 'high'
export type UnavailableReason = 'not_configured' | 'not_supported' | 'no_location' | 'upstream_error'
export type Unavailable = { available: false; reason: UnavailableReason }
export type Range3 = [number, number, number]

export type ZoneData = {
  code: string
  number: number
  half: 'a' | 'b'
  value: number
  minC: number
  maxC: number
}

export type ClimateSource = {
  key: string
  title: string
  publisher: string
  year: number | null
  url: string | null
  licence?: string | null
}

/** Where one value comes from: its sources and the station values with the method. */
export type ValueReference = {
  sources: { key: string; publisher: string; url: string | null }[]
  detail: string | null
}

export type ClimateStation = {
  name: string
  id: string | null
  altitudeM: number | null
  source: string
}

export type NormalsField = Exclude<keyof Normals, 'frostFreeDays'>
export type DeltaField = keyof ProjectionData['deltas']

export type Normals = {
  meanTempC: number | null
  summerMeanTempC: number | null
  winterMeanTempC: number | null
  annualPrecipMm: number | null
  frostDays: number | null
  extremeMinC: number | null
  lastSpringFrost: string | null
  firstAutumnFrost: string | null
  frostFreeDays: number | null
}

export type CurrentClimate = {
  available: true
  subArea: { key: string; name: string; description: string | null }
  normals: Normals
  zone: ZoneData | null
  referencePeriod: string | null
  status: string
  note: string | null
  stations: ClimateStation[]
  references: Partial<Record<NormalsField, ValueReference>>
  sources: ClimateSource[]
}

export type ProjectionData = {
  available: true
  horizon: Horizon
  scenario: Scenario
  period: string | null
  ipcc: string | null
  referencePeriod: string | null
  extremeMinC: number
  extremeMinRangeC: [number, number]
  zone: ZoneData
  zoneRange: [string, string]
  meanTempC: number | null
  summerMeanTempC: number | null
  deltas: {
    meanTempC: Range3
    extremeMinC: Range3
    summerTempC: Range3
    summerPrecipPct: Range3
    winterPrecipPct: Range3
  }
  status: string
  references: Partial<Record<DeltaField, string>>
  sources: ClimateSource[]
}

export type PlantStatus = 'ok' | 'borderline' | 'at_risk' | 'unknown'
export type PlantRisk = 'cold' | 'heat' | 'drought'
export type PlantFuture = { status: PlantStatus; risks: PlantRisk[] }

export type PlantCheckItem = {
  key: string
  name: string
  latinName: string | null
  quantity: number
  coldLimitC: number | null
  maxZone: string | null
  drought: 'tolerant' | 'sensitive' | null
  traitsKnown: boolean
  today: { status: PlantStatus; marginC: number | null; risks: PlantRisk[] }
  future: Record<Horizon, Record<Scenario, PlantFuture | null>>
}

export type Locked = { locked: true }

export type ProjectionsBlock =
  | Locked
  | Unavailable
  | {
      available: true
      scenarios: { key: Scenario; ipcc: string | null }[]
      horizons: Record<Horizon, Record<Scenario, ProjectionData | Unavailable>>
    }

export type PlantsBlock =
  | (Locked & { count: number })
  | (Unavailable & { count: number })
  | {
      available: true
      count: number
      items: PlantCheckItem[]
      summary: {
        today: Partial<Record<PlantStatus, number>>
        future: Record<Horizon, Record<Scenario, Partial<Record<PlantStatus, number>>>>
      }
    }

export type ClimateReport = {
  location: { lng: number; lat: number } | null
  entitled: boolean
  capabilities: { normals: boolean; projections: boolean; forecast: boolean }
  current: CurrentClimate | Unavailable
  projections: ProjectionsBlock
  plants: PlantsBlock
  sources: ClimateSource[]
}

export type ForecastDay = {
  date: string
  weatherCode: number | null
  tmaxC: number | null
  tminC: number | null
  precipMm: number | null
  precipProbabilityPct: number | null
  windGustsKmh: number | null
}

export type ForecastAlert =
  | { kind: 'frost'; dates: string[]; minC: number; plants: { name: string; coldLimitC: number }[] }
  | { kind: 'heat'; dates: string[]; maxC: number }

export type ForecastReport =
  | { available: false; reason: UnavailableReason; supported: boolean }
  | {
      available: true
      supported: true
      days: ForecastDay[]
      alerts: ForecastAlert[]
      attribution: { name: string; url: string; licence: string } | null
      fetchedAt: string
    }

// -------------------------------------------------------------- finances

export const CHANNELS = ['retail', 'restaurant', 'direct'] as const
export type Channel = (typeof CHANNELS)[number]

export const INVESTMENT_CATEGORIES = ['plants', 'earthworks', 'fencing', 'equipment', 'design', 'other'] as const
export const REVENUE_KINDS = ['workshops', 'visits', 'wood', 'other'] as const
export const SUBSIDY_KINDS = ['pac', 'hedges', 'agroforestry', 'other'] as const
export const VARIABLE_BASES = ['per_kg', 'per_ha', 'pct_sales'] as const

export type FinanceSettings = {
  startYear: number
  areaHa: number | null
  labourCostPerHour: number | null
  openingCash: number | null
  plantReplacementPct: number | null
  plantDepreciationYears: number
}

export type SpeciesLine = {
  id: string
  sourceKey: string | null
  name: string | null
  latinName: string | null
  quantity: number | null
  unitPrice: number | null
  plantingYear: number
  firstHarvestAge: number | null
  fullProductionAge: number | null
  yieldKgPerPlant: number | null
  pickingRateKgPerHour: number | null
  lossPct: number | null
  retailSharePct: number | null
  retailPrice: number | null
  restaurantSharePct: number | null
  restaurantPrice: number | null
  directSharePct: number | null
  directPrice: number | null
  notes: string | null
}

export type Investment = {
  id: string
  label: string | null
  category: (typeof INVESTMENT_CATEGORIES)[number]
  amount: number | null
  year: number
  depreciationYears: number | null
}

export type YearlyRow = {
  id: string
  label: string | null
  amount: number | null
  startYear: number
  endYear: number | null
}

export type OtherRevenue = YearlyRow & { kind: (typeof REVENUE_KINDS)[number] }
export type Subsidy = YearlyRow & { kind: (typeof SUBSIDY_KINDS)[number] }

export type VariableCost = {
  id: string
  label: string | null
  basis: (typeof VARIABLE_BASES)[number]
  rate: number | null
  startYear: number
  endYear: number | null
}

export type Loan = {
  id: string
  label: string | null
  amount: number | null
  ratePct: number | null
  years: number | null
  startYear: number
}

export type CarbonInputs = {
  enabled: boolean
  tCo2PerHaYear: number | null
  pricePerT: number | null
  startYear: number
}

export type FinanceInputs = {
  settings: FinanceSettings
  carbon: CarbonInputs
  species: SpeciesLine[]
  investments: Investment[]
  fixedCosts: YearlyRow[]
  variableCosts: VariableCost[]
  otherRevenues: OtherRevenue[]
  subsidies: Subsidy[]
  loans: Loan[]
}

export type FinanceYear = {
  year: number
  calendarYear: number
  harvestKg: number
  soldKg: number
  pickingHours: number
  sales: number
  otherRevenue: number
  subsidies: number
  carbon: number
  revenue: number
  fixedCosts: number
  variableCosts: number
  labourCost: number
  operatingCosts: number
  ebitda: number
  depreciation: number
  interest: number
  result: number
  investments: number
  loanReceived: number
  loanRepaid: number
  netCashFlow: number
  cumulativeCash: number
}

export type FinanceIndicators = {
  horizonYears: number
  startYear: number
  areaHa: number | null
  totalInvestment: number
  investmentByCategory: Record<string, number>
  totalRevenue: number
  totalSubsidies: number
  totalResult: number
  breakEvenYear: number | null
  paybackYear: number | null
  lowestCash: number
  lowestCashYear: number
  fundingNeed: number
  finalCash: number
  peakHarvestYear: number | null
  peakHarvestKg: number
  peakPickingHours: number
  loanBalanceEnd: number
}

export type FinanceWarning = { code: string; names?: string[] }

export type FinanceResult = {
  years: FinanceYear[]
  species: { id: string; name: string | null; harvestKg: number[]; sales: number[]; pickingHours: number[] }[]
  indicators: FinanceIndicators
  warnings: FinanceWarning[]
}

export type FinancePlanData = {
  inputs: FinanceInputs
  lockVersion: number
  persisted: boolean
  updatedAt: string | null
  areaHaFromMap: number | null
}

export type FinanceSummary = {
  plan: { persisted: boolean; updatedAt: string | null }
  summary: {
    totalInvestment: number
    breakEvenYear: number | null
    paybackYear: number | null
    fundingNeed: number
    finalCash: number
    startYear: number
    peakPickingHours: number
    speciesCount: number
    warningsCount: number
  }
}
