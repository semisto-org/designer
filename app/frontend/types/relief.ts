// Types of the relief-water feature area (terrain import, 3D relief, water).

export type TerrainStatus = 'pending' | 'running' | 'ready' | 'failed'

export type TerrainStats = {
  zMin?: number
  zMax?: number
  drop?: number
  slopeMeanPct?: number | null
  slopeP90Pct?: number | null
  cells?: number
}

export type TerrainSummary = {
  status: TerrainStatus
  progress: number
  error: string | null
  fetchedAt: string | null
  startedAt: string | null
  cellSizeM: number | null
  cols: number | null
  rows: number | null
  stats: TerrainStats
  sources: Record<string, string>
  warnings: string[]
  attribution: string | null
  layers: { surface: boolean; landcover: boolean; texture: boolean }
}

export type WaterSettings = {
  annualRainfallMm: number | null
  roofCoefficient: number
  soil: string
  uniformRateMmH: number
  storageMm: number
}

export type Rainwater = {
  roofAreaM2: number
  buildings: number
  annualRainfallMm: number | null
  coefficient: number
  volumeM3: number | null
}

/** GET /maps/:id/terrain — the editor panel's data. */
export type ReliefOverview = {
  available: boolean
  providerLabel: string | null
  hasBoundary: boolean
  grid: { cellSizeM: number; cols: number; rows: number; areaKm2: number; marginM: number } | { error: string } | null
  terrain: TerrainSummary | null
  settings: WaterSettings
  defaults: WaterSettings
  soils: string[]
  rainwater: Rainwater
}

/** The grid the 3D page decodes (MapTerrain#as_grid). */
export type TerrainGridData = {
  version: string
  crs: string
  west: number
  north: number
  step: number
  cols: number
  rows: number
  cellSizeM: number
  lat0: number
  marginM: number
  zMin: number
  zMax: number
  zUnit: number
  nodata: number
  surface: { zMin: number; zMax: number; zUnit: number } | null
  landcover: boolean
  texture: { width: number; height: number } | null
  files: { grid: string | null; surface: string | null; landcover: string | null; texture: string | null }
  stats: TerrainStats
  sources: Record<string, string>
  attribution: string | null
  fetchedAt: string | null
}

export type LandcoverClassData = { label: string; rate: number; storage: number; color: string }

/** The soil model of the rain simulation (map settings over region defaults). */
export type SoilModel = {
  soil: string
  uniformRate: number
  storage: number
  rateFactor: number
  storageFactor: number
  percolation: number
}
