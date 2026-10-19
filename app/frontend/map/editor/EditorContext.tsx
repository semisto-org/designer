import type { Geometry } from 'geojson'
import type { Map as MapLibreMap } from 'maplibre-gl'
import { createContext, useContext } from 'react'
import type { DrawOptions, DrawShape, PointTool } from '@/map/editor/draw'
import type {
  EntitlementsData, FeatureLayer, MapData, MapFeature, MapFeatureProperties, MapStage, RegionLayerData,
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
  tags?: string[]
}

/** swap_number: a plant taking a number another plant holds gives it its own (the other comes back in `swapped`). */
export type FeaturePatch = Partial<Omit<NewFeature, 'geometry'>> & { geometry?: Geometry; swap_number?: boolean }

export type SavedFeature = MapFeature & { swapped?: MapFeature }

/** A button in the editor's toast (« Annuler » after a deletion). */
export type NotifyAction = { label: string; run: () => void }

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
  /** Elements picked together (Shift+click, or « Sélectionner plusieurs » on a phone) to move them at once; usually empty. */
  selection: number[]
  setSelection: (ids: number[]) => void
  /** A tap adds to the selection instead of replacing it (phones have no Shift key). */
  multiSelect: boolean
  setMultiSelect: (on: boolean) => void
  createFeature: (input: NewFeature) => Promise<MapFeature>
  updateFeature: (id: number, patch: FeaturePatch) => Promise<SavedFeature>
  /** To the trash; « Annuler » (⌘Z, or the toast's button) restores it. */
  deleteFeature: (id: number) => Promise<void>
  /** An AI draft reviewed outside updateFeature (Maps::DraftsController), so ⌘Z can put it back to review. */
  recordDraftReview: (draft: MapFeature, verdict: 'accept' | 'reject', after?: MapFeature) => void
  /** An element put in the trash outside deleteFeature (an AI's deletion accepted), so ⌘Z restores it. */
  recordRemoval: (feature: MapFeature) => void
  /** Every change made by `run` is undone in one ⌘Z (« Tout accepter », a group move). */
  undoGroup: <T>(label: string, run: () => Promise<T>) => Promise<T>
  /** The last change undone, like ⌘Z (the « Annuler » of a toast). */
  undo: () => void
  /** Replace or insert features received from elsewhere (other panels, real time). */
  upsertFeatures: (features: MapFeature[]) => void
  removeFeatures: (ids: number[]) => void
  reloadFeatures: () => Promise<void>

  /** Let the user draw one shape; resolves null if cancelled. */
  draw: (shape: DrawShape, options?: DrawOptions) => Promise<Geometry | null>
  /** Let the user reshape a geometry (drag vertices or the shape); resolves on finishDraw(), null on cancelDraw(). */
  editGeometry: (geometry: Geometry, options?: DrawOptions) => Promise<Geometry | null>
  /** What a click does on a line or polygon being reshaped: move, add or remove points. */
  setPointTool: (tool: PointTool) => void
  /** Finish the current drawing now (closes a line or polygon, keeps an edit). */
  finishDraw: () => void
  /** Step back in the shape being drawn (its last point) or edited (its last drag), like ⌘Z. */
  undoDrawStep: () => void
  cancelDraw: () => void
  drawing: boolean
  /** What is being drawn ('edit' while reshaping), null when idle. */
  drawingShape: DrawShape | 'edit' | null

  activePanel: string | null
  openPanel: (id: string | null) => void
  /** The step the rail and the guide card put forward: the map's stage unless the person picked another in the header. */
  focusStage: MapStage
  focusStep: (stage: MapStage | null) => void
  notify: (message: string, tone?: 'info' | 'error', action?: NotifyAction) => void
}

export const EditorContext = createContext<Editor | null>(null)

export function useEditor(): Editor {
  const editor = useContext(EditorContext)
  if (!editor) throw new Error('useEditor must be used inside the map editor')
  return editor
}

export type { MapFeatureProperties }
