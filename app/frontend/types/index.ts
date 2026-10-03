import type { Feature, FeatureCollection, Geometry, MultiPolygon } from 'geojson'

export type FlashData = {
  notice?: string
  alert?: string
}

export type CurrentUser = {
  id: number
  name: string
  email: string
  avatarUrl: string | null
  admin: boolean
}

export type EntitlementsData = {
  plan: 'free' | 'yearly' | 'atelier' | 'bureau'
  maxMaps: number
  pdfExport: boolean
  analyses: boolean
  aiDrafts: boolean
}

export type SharedProps = {
  currentUser: CurrentUser | null
  entitlements: EntitlementsData | null
  env: { googleSignIn: boolean; billing: boolean }
}

export type LngLat = [number, number]
export type BBox = [number, number, number, number]

export type RegionData = {
  id: number
  key: string
  name: string
  center: LngLat | null
  bounds: BBox | null
  defaultZoom: number
}

export type RegionLayerData = {
  id: number
  key: string
  name: string
  group: string | null
  category: 'base' | 'overlay'
  kind: 'wms' | 'xyz' | 'arcgis_rest'
  layers: string | null
  attribution: string | null
  opacity: number
  legendUrl: string | null
  minZoom: number | null
  maxZoom: number | null
  identifiable: boolean
  proxied: boolean
  url: string | null
  options: Record<string, unknown>
}

export type MapRole = 'owner' | 'editor' | 'viewer'
export type MapStage = 'observe' | 'map' | 'design' | 'plant'

export type MapData = {
  id: number
  name: string
  description: string | null
  address: string | null
  stage: MapStage
  parcels: string[]
  areaM2: number | null
  boundary: MultiPolygon | null
  center: LngLat | null
  zoom: number | null
  bbox: BBox | null
  region: RegionData
  role: MapRole | null
  ownerName: string
  updatedAt: string
  lockVersion: number
  /** The owner's plan no longer covers this map: it stays readable but cannot be edited. */
  readOnlyByPlan?: boolean
}

export type FeatureLayer =
  | 'existing' | 'water' | 'access' | 'structures' | 'plants' | 'animals' | 'networks' | 'notes'

export type MapFeatureProperties = {
  id: number
  layer: FeatureLayer
  kind: string
  name: string | null
  notes: string | null
  status: 'active' | 'draft' | 'rejected'
  source: 'human' | 'ai'
  rationale: string | null
  style: Record<string, unknown>
  lockVersion: number
  updatedAt: string
  [key: string]: unknown
}

export type MapFeature = Feature<Geometry, MapFeatureProperties>
export type MapFeatureCollection = FeatureCollection<Geometry, MapFeatureProperties>
