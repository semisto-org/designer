import type { MultiPolygon } from 'geojson'
import type { BBox } from '@/types'

/** One line of what a data layer says at a point (all plain text). */
export type IdentifyEntry = {
  text: string
  detail: string | null
  /** https only, checked server side. */
  href: string | null
  hrefLabel: string | null
}

export type IdentifyStatus = 'ok' | 'empty' | 'unavailable'

export type IdentifyLayerResult = {
  key: string
  name: string
  status: IdentifyStatus
  entries: IdentifyEntry[]
}

export type IdentifyResponse = { lng: number; lat: number; results: IdentifyLayerResult[] }

export type GeocodeResult = {
  label: string
  detail: string | null
  lng: number
  lat: number
  bbox: BBox | null
  zoom: number
}

export type GeocodeResponse = { available: boolean; results: GeocodeResult[]; message?: string }

export type ParcelData = {
  capakey: string
  label: string
  detail: string | null
  geometry: MultiPolygon
  /** Where it was picked (lets the server identify it again). */
  lng: number
  lat: number
}

/** What the "Couches" panel shows, remembered per map in localStorage. */
export type LayerChoice = {
  base: string | null
  overlays: string[]
  opacity: Record<string, number>
}
