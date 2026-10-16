// Observations made during a downpour (`kind: storm_observation`): the
// season of each, how wet the soil already was, and the map's observations
// in the order they were seen. No import, so it is tested alone.

export type StormWater = 'flows' | 'pools' | 'seeps'
export type Season = 'winter' | 'spring' | 'summer' | 'autumn'
export type SoilState = 'wet' | 'moist' | 'dry'

export type StormRelief =
  | { available: false; reason: string; message: string }
  | {
      available: true
      water: StormWater
      verdict: 'follows' | 'diverges' | 'uphill' | 'hollow' | 'flat' | 'sloped' | 'seep'
      shareOnAxes: number | null
      fallM: number | null
      slopePct: number | null
      hollowM: number | null
      drainedM2: number | null
      infiltrationMmH: number | null
      infiltrationDistanceM: number | null
    }

export type StormRain =
  | { available: false; reason: string }
  | { available: true; date: string; dayMm: number; before3Mm: number | null; station: { name: string; distanceKm: number } }

export type StormCheck = { relief: StormRelief; rain: StormRain }

const WATER_BY_GEOMETRY: Record<string, StormWater> = { LineString: 'flows', Polygon: 'pools', Point: 'seeps' }

export function waterOf(properties: Record<string, unknown>, geometryType: string | undefined): StormWater {
  const water = properties.water
  if (water === 'flows' || water === 'pools' || water === 'seeps') return water
  return WATER_BY_GEOMETRY[geometryType ?? ''] ?? 'flows'
}

/** Meteorological seasons: winter is December to February. */
export function seasonOf(date: Date): Season {
  const month = date.getMonth()
  if (month === 11 || month <= 1) return 'winter'
  if (month <= 4) return 'spring'
  if (month <= 7) return 'summer'
  return 'autumn'
}

/** How wet the soil was from the rain of the three days before. */
export function soilState(before3Mm: number): SoilState {
  if (before3Mm >= 20) return 'wet'
  if (before3Mm >= 5) return 'moist'
  return 'dry'
}

export type HistoryItem = { id: number; at: Date; water: StormWater; rain: string | null }

/** The observations of a map, most recent first, with a valid time. */
export function stormHistory(features: Array<{ properties: Record<string, unknown>; geometry?: { type: string } | null }>): HistoryItem[] {
  return features
    .filter((f) => f.properties.kind === 'storm_observation' && f.properties.status !== 'rejected')
    .flatMap((f) => {
      const at = new Date(String(f.properties.observed_at ?? ''))
      if (Number.isNaN(at.getTime())) return []
      return [{ id: Number(f.properties.id), at, water: waterOf(f.properties, f.geometry?.type), rain: typeof f.properties.rain === 'string' ? f.properties.rain : null }]
    })
    .sort((a, b) => b.at.getTime() - a.at.getTime())
}

/** `datetime-local` value of an ISO time, in the browser's time zone. */
export function toLocalInput(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}
