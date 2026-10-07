// Shapes returned by the server (see app/controllers/api/v1 and the
// models' as_inertia / as_geojson). Only the fields the app reads.
export type Position = [number, number]
export type Geometry =
  | { type: 'Point'; coordinates: Position }
  | { type: 'LineString'; coordinates: Position[] }
  | { type: 'Polygon'; coordinates: Position[][] }
  | { type: 'MultiPolygon'; coordinates: Position[][][] }
  | { type: 'MultiLineString'; coordinates: Position[][] }

export type Role = 'owner' | 'editor' | 'viewer'

export type MapSummary = {
  id: number
  name: string
  address: string | null
  role: Role
  ownerName: string
  updatedAt: string
  readOnlyByPlan: boolean
  areaM2: number | null
  bbox: [number, number, number, number] | null
  center: Position | null
  zoom: number | null
  boundary: Geometry | null
}

export type FeatureProperties = {
  id: number
  layer: string
  kind: string
  name: string | null
  notes: string | null
  status: 'active' | 'draft' | 'rejected'
  lockVersion: number
  updatedAt?: string
  species_id?: number
  variety_id?: number
  planted_on?: string
  [key: string]: unknown
}

export type MapFeature = { type: 'Feature'; id: number; geometry: Geometry; properties: FeatureProperties }

export type Photo = {
  id: number
  caption: string | null
  takenAt: string | null
  lng: number | null
  lat: number | null
  featureId: number | null
  uploadedBy: string | null
}

export type Species = { id: number; latinName: string; commonName: string | null; strata: string | null }

export type Planting = {
  species: Record<string, Species>
  varieties: Record<string, { id: number; speciesId: number; name: string }>
  palette: { id: number; speciesId: number; name: string; latinName: string }[]
}

export type RegionLayer = {
  key: string
  name: string
  category: 'base' | 'overlay'
  kind: string
  options: Record<string, unknown>
}

export type MapBundle = {
  map: MapSummary
  mapEntitlements: Record<string, unknown>
  layers: RegionLayer[]
  features: MapFeature[]
  photos: Photo[]
  planting: Planting
  syncedAt: string
}

export type Comment = {
  id: number
  body: string
  author: { id: number; name: string }
  createdAt: string
}

export type Survival = 'established' | 'struggling' | 'dead'

export type IdentificationCandidate = {
  latinName: string
  commonNames: string[]
  percent: number
  species: { id: number; latinName: string; commonName: string | null } | null
  /** The entry of the bio-indicator list; null when the list does not have it. */
  bioindicator: { key: string; name: string; latin: string; indicates: string[]; unverified: string[] } | null
}

export const canEdit = (map: MapSummary) => (map.role === 'owner' || map.role === 'editor') && !map.readOnlyByPlan
