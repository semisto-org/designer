// JSON of GET /maps/:id/sun (Sun::MapReport).

export type SunReason = 'no_location' | 'not_configured' | 'out_of_coverage' | 'upstream_error'

export type HorizonPoint = { azimuth: number; height: number }

export type SunHorizon =
  | { available: true; profile: HorizonPoint[]; elevationM: number | null; source: string | null }
  | { available: false; reason: SunReason }

export type SunPathKey = 'winter_solstice' | 'equinox' | 'summer_solstice'

export type SunPathPoint = { minutes: number; azimuth: number; elevation: number }

export type SunPath = {
  key: SunPathKey
  date: string
  noonElevation: number
  openHours: number
  terrainHours: number | null
  firstSun: number | null
  lastSun: number | null
  points: SunPathPoint[]
}

export type SunMonth = {
  month: number
  date: string
  openHours: number
  terrainHours: number | null
  firstSun: number | null
  lastSun: number | null
  irradiationKwhM2: number | null
}

export type SunIrradiation =
  | { available: true; annualKwhM2: number; yearMin: number | null; yearMax: number | null; database: string | null }
  | { available: false; reason: SunReason }

export type SunSource = { key: string; publisher: string; title: string; licence: string | null; url: string | null }

export type SunReport =
  | { location: null; available: false; reason: SunReason }
  | {
      location: { lng: number; lat: number }
      available: true
      horizon: SunHorizon
      paths: SunPath[]
      months: SunMonth[]
      irradiation: SunIrradiation
      sources: SunSource[]
    }
