import type { Geometry } from 'geojson'
import type { Map as MapLibreMap } from 'maplibre-gl'
import { createContext, useContext } from 'react'
import type { DrawShape } from '@/map/editor/draw'
import type {
  EntitlementsData, FeatureLayer, MapData, MapFeature, MapFeatureProperties, RegionLayerData,
} from '@/types'

export type NewFeature = {
  layer: FeatureLayer
  kind: string
  geometry: Geometry
  name?: string | null
  notes?: string | null
  properties?: Record<string, unknown>
  style?: Record<string, unknown>
  status?: 'active' | 'draft'
}

export type FeaturePatch = Partial<Omit<NewFeature, 'geometry'>> & { geometry?: Geometry }

/**
 * Everything a panel, tool or inspector of the map editor needs. Panels
 * never talk to MapLibre or the server directly for features: they go
 * through these actions so the map, the list and the server stay in sync.
 */
export type Editor = {
  map: MapData
  setMap: (map: MapData) => void
  instance: MapLibreMap
  regionLayers: RegionLayerData[]
  entitlements: EntitlementsData
  canEdit: boolean
  isOwner: boolean

  features: MapFeature[]
  selectedId: number | null
  selected: MapFeature | null
  select: (id: number | null) => void
  createFeature: (input: NewFeature) => Promise<MapFeature>
  updateFeature: (id: number, patch: FeaturePatch) => Promise<MapFeature>
  deleteFeature: (id: number) => Promise<void>
  /** Replace or insert features received from elsewhere (other panels, real time). */
  upsertFeatures: (features: MapFeature[]) => void
  removeFeatures: (ids: number[]) => void
  reloadFeatures: () => Promise<void>

  /** Let the user draw one shape; resolves null if cancelled. */
  draw: (shape: DrawShape) => Promise<Geometry | null>
  cancelDraw: () => void
  drawing: boolean

  activePanel: string | null
  openPanel: (id: string | null) => void
  notify: (message: string, tone?: 'info' | 'error') => void
}

export const EditorContext = createContext<Editor | null>(null)

export function useEditor(): Editor {
  const editor = useContext(EditorContext)
  if (!editor) throw new Error('useEditor must be used inside the map editor')
  return editor
}

export type { MapFeatureProperties }
