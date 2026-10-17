import { useSyncExternalStore } from 'react'

/**
 * Small shared state of the drawing tools: which design layers, kinds of
 * elements and plant strata are hidden (per viewer and per map, kept in
 * localStorage), which tool is open and the
 * feature whose shape is being edited. Shared by the toolbar, the
 * inspector section, the layers panel and the exports.
 */
export type DrawingTool = 'draw' | 'zone' | 'measure' | 'sketch' | 'shape' | null

export type DrawingState = {
  mapId: number | null
  hiddenLayers: string[]
  /** Kinds of elements hidden on their own (« mare », « haie »…), their layer staying shown. */
  hiddenKinds: string[]
  /** Plant strata hidden (`unknown`: plants whose strata is not known). */
  hiddenStrata: string[]
  /** Markers of the « Sol » module hidden here: `bioindicators`, `samples`. */
  hiddenSoil: string[]
  tool: DrawingTool
  shapeEditId: number | null
  /** The tag shown as « version » on the map (null: everything). */
  version: string | null
}

let state: DrawingState = { mapId: null, hiddenLayers: [], hiddenKinds: [], hiddenStrata: [], hiddenSoil: [], tool: null, shapeEditId: null, version: null }
const listeners = new Set<() => void>()

export const drawingStore = {
  get: () => state,
  set(patch: Partial<DrawingState>) {
    state = { ...state, ...patch }
    listeners.forEach((listener) => listener())
  },
  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },
}

export function useDrawingState<T>(select: (s: DrawingState) => T): T {
  return useSyncExternalStore(drawingStore.subscribe, () => select(state))
}

type HiddenList = 'layers' | 'kinds' | 'strata' | 'soil'
const storageKey = (mapId: number, list: HiddenList = 'layers') => `designer:map:${mapId}:hidden-${list}`
const versionKey = (mapId: number) => `designer:map:${mapId}:version`

function readList(mapId: number, list: HiddenList): string[] {
  try {
    const saved = JSON.parse(window.localStorage.getItem(storageKey(mapId, list)) ?? '[]')
    return Array.isArray(saved) ? saved.filter((v): v is string => typeof v === 'string') : []
  } catch {
    return []
  }
}

function writeList(list: HiddenList, values: string[]) {
  if (state.mapId == null) return
  try {
    window.localStorage.setItem(storageKey(state.mapId, list), JSON.stringify(values))
  } catch {
    // Private mode or blocked storage: the choice lasts for this visit only.
  }
}

/** Loads the hidden layers, kinds, strata and soil markers remembered for this map (if storage allows). */
export function initDrawingState(mapId: number) {
  if (state.mapId === mapId) return
  const hidden = readList(mapId, 'layers')
  let version: string | null = null
  try {
    version = window.localStorage.getItem(versionKey(mapId)) || null
  } catch {
    version = null
  }
  drawingStore.set({
    mapId, hiddenLayers: hidden, hiddenKinds: readList(mapId, 'kinds'), hiddenStrata: readList(mapId, 'strata'), hiddenSoil: readList(mapId, 'soil'),
    tool: null, shapeEditId: null, version,
  })
}

/** Shows one version (a tag) on the map, or everything with null; remembered per map. */
export function setVersion(version: string | null) {
  drawingStore.set({ version })
  if (state.mapId == null) return
  try {
    if (version) window.localStorage.setItem(versionKey(state.mapId), version)
    else window.localStorage.removeItem(versionKey(state.mapId))
  } catch {
    // Private mode or blocked storage: the choice lasts for this visit only.
  }
}

export function setHiddenLayers(hidden: string[]) {
  drawingStore.set({ hiddenLayers: hidden })
  writeList('layers', hidden)
}

export function setHiddenKinds(kinds: string[]) {
  drawingStore.set({ hiddenKinds: kinds })
  writeList('kinds', kinds)
}

export function setHiddenStrata(strata: string[]) {
  drawingStore.set({ hiddenStrata: strata })
  writeList('strata', strata)
}

export function setHiddenSoil(soil: string[]) {
  drawingStore.set({ hiddenSoil: soil })
  writeList('soil', soil)
}

/** Adds or removes one value of a hidden list. */
export const toggled = (list: string[], value: string) => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value])

/** Before drawing an element: its layer and its kind show again, so one sees what one draws. */
export function revealForDrawing(layer: string, kind?: string) {
  const { hiddenLayers, hiddenKinds } = drawingStore.get()
  if (hiddenLayers.includes(layer)) setHiddenLayers(hiddenLayers.filter((l) => l !== layer))
  if (kind && hiddenKinds.includes(kind)) setHiddenKinds(hiddenKinds.filter((k) => k !== kind))
}

/** « Tout afficher »: every layer, kind, strata and soil marker again. */
export function showEverything() {
  setHiddenLayers([])
  setHiddenKinds([])
  setHiddenStrata([])
  setHiddenSoil([])
}

/** Asks the drawing toolbar to let the user reshape a feature. */
export function startShapeEdit(featureId: number) {
  drawingStore.set({ tool: 'shape', shapeEditId: featureId })
}
