// Ported from Claudy (MIT, © 2022-2023 Fondation Les 4 Sources)
//
// What the soil drinks (mm/h) and holds before saturating (mm), per
// simulation cell: the mean of the land cover classes of the block, scaled by
// the map's soil type. Without land cover, the map's uniform rate everywhere.
// Orders of magnitude from runoff models, not measurements: the interface
// says "indicatif".

export type LandcoverClass = { label: string; rate: number; storage: number; color: string }

export type SoilSettings = {
  /** mm/h without land cover (and for unknown classes). */
  uniformRate: number
  /** mm of reserve without land cover. */
  storage: number
  /** Soil type multipliers (clay < loam < sand). */
  rateFactor: number
  storageFactor: number
}

export const UNKNOWN_CLASS: Omit<LandcoverClass, 'label'> = { rate: 15, storage: 50, color: '#d2cdbe' }

export function buildSoilMaps(
  cols: number, rows: number, factor: number, landcover: Uint8Array | null,
  classes: Record<string, LandcoverClass>, settings: SoilSettings,
): { rate: Float32Array; storage: Float32Array } {
  const simCols = Math.floor(cols / factor)
  const simRows = Math.floor(rows / factor)
  const n = simCols * simRows
  const rate = new Float32Array(n)
  const storage = new Float32Array(n)
  const area = factor * factor
  const lookup = new Map<number, { rate: number; storage: number }>()
  for (const [code, value] of Object.entries(classes)) lookup.set(Number(code), value)
  const unknown = { rate: settings.uniformRate, storage: settings.storage }
  for (let r = 0; r < simRows; r++) {
    for (let c = 0; c < simCols; c++) {
      let rateSum = 0
      let storageSum = 0
      for (let dr = 0; dr < factor; dr++) {
        for (let dc = 0; dc < factor; dc++) {
          const i = (r * factor + dr) * cols + c * factor + dc
          const kind = landcover ? lookup.get(landcover[i]) ?? unknown : unknown
          rateSum += kind.rate
          storageSum += kind.storage
        }
      }
      rate[r * simCols + c] = (rateSum / area) * settings.rateFactor
      storage[r * simCols + c] = (storageSum / area) * settings.storageFactor
    }
  }
  return { rate, storage }
}

/** Initial fill of the soil reserve. */
export const SOIL_STATES = { dry: 0.1, normal: 0.5, wet: 0.9 } as const
export type SoilState = keyof typeof SOIL_STATES

/** Rainwater from roofs in a year (m³): area × rainfall × coefficient. */
export function roofRainwater(roofAreaM2: number, annualRainfallMm: number, coefficient: number): number {
  return roofAreaM2 * (annualRainfallMm / 1000) * coefficient
}
