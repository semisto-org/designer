import type { FeatureCollection, Point } from 'geojson'

/** JSON of WeatherStations::MapReport (GET /maps/:id/weather_stations). */
export type WeatherStation = {
  code: number
  name: string
  lng: number
  lat: number
  altitudeM: number | null
  networks: string[]
  /** Publishes daily observations (AWS network). */
  daily: boolean
  distanceKm: number
  altitudeDiffM: number | null
  nearest: boolean
}

export type WeatherDay = {
  date: string
  tminC: number | null
  tmaxC: number | null
  tavgC: number | null
  precipMm: number | null
  soilTemp10cmC: number | null
  sunHours: number | null
}

export type WeatherSummary = {
  lastDate: string | null
  rain7Mm: number | null
  rain30Mm: number | null
  days7: number
  days30: number
  coldestNight: { date: string; tminC: number } | null
  frost7: boolean
  frostNights30: number
}

export type WeatherObserved = {
  station: WeatherStation | null
  chosen: WeatherStation | null
} & (
  | { available: true; days: WeatherDay[]; summary: WeatherSummary }
  | { available: false; reason: string }
)

export type WeatherAttribution = { name: string; url: string; licence: string }

export type WeatherStationsReport =
  | { available: false; reason: 'not_configured' | 'no_location' | 'upstream_error' | string }
  | {
    available: true
    location: { lng: number; lat: number }
    terrainAltitudeM: number | null
    stations: WeatherStation[]
    observed: WeatherObserved
    attribution: WeatherAttribution
  }

export type StationProperties = {
  code: number
  name: string
  altitudeM: number | null
  networks: string[]
  daily: boolean
  nearest: boolean
}

/** GET /maps/:id/weather_stations/stations */
export type StationsGeoJSON = FeatureCollection<Point, StationProperties> & {
  available: boolean
  reason?: string
  attribution?: WeatherAttribution
}
