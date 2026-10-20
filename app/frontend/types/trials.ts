import type { BBox, LngLat, RegionData, RegionLayerData } from '@/types'
import type { MultiPolygon } from 'geojson'

export type Compass = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw'

/** What the relief says (Trials::Reading); only the area without relief. */
export type TrialReading = {
  area_m2?: number
  slope_pct?: number
  downhill?: Compass
  drop_m?: number
  low_point?: LngLat
  low_side?: Compass
}

export type TrialData = {
  token: string
  address: string | null
  center: LngLat
  boundary: MultiPolygon | null
  bbox: BBox | null
  areaM2: number | null
  parcels: { capakey: string; label: string }[]
  region: RegionData | null
  expiresAt: string
  cadastre: boolean
  relief: boolean
}

export type TrialShowProps = {
  trial: TrialData
  layers: RegionLayerData[]
  cadastreLayer: string | null
  knows: string[]
  regionName: string | null
  from: { token: string; title: string; path: string } | null
  maxParcels: number
}

export type TrialNewProps = {
  from: { token: string; title: string; path: string } | null
  region: RegionData
}
