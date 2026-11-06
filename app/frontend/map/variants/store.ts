import { useSyncExternalStore } from 'react'
import { shownVariant, type MapVariant } from './variants'

/**
 * The map's variants (from the server) and the one this viewer chose to
 * look at, remembered per map (null: the retained one). Read by the map
 * layers, the picker, the « Variantes » panel, the exports and « Présenter ».
 */
type State = { mapId: number | null; variants: MapVariant[]; chosen: number | null }

let state: State = { mapId: null, variants: [], chosen: null }
const listeners = new Set<() => void>()
const chosenKey = (mapId: number) => `designer:map:${mapId}:variant`

function emit(patch: Partial<State>) {
  state = { ...state, ...patch }
  listeners.forEach((listener) => listener())
}

export const variantStore = {
  get: () => state,
  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },
}

export function useVariants<T>(select: (s: State) => T): T {
  return useSyncExternalStore(variantStore.subscribe, () => select(state))
}

/** The id of the variant on the map now (null: the map has none). */
export function shownVariantId(s: State = state): number | null {
  return shownVariant(s.variants, s.chosen)?.id ?? null
}

export function useShownVariant(): MapVariant | null {
  return useVariants((s) => shownVariant(s.variants, s.chosen))
}

export function initVariants(mapId: number, variants: MapVariant[]) {
  if (state.mapId === mapId) return
  let chosen: number | null = null
  try {
    chosen = Number(window.localStorage.getItem(chosenKey(mapId))) || null
  } catch {
    chosen = null
  }
  emit({ mapId, variants, chosen })
}

export function setVariants(variants: MapVariant[]) {
  emit({ variants })
}

/** Shows this variant on the map (null: the retained one); remembered per map. */
export function showVariant(id: number | null) {
  emit({ chosen: id })
  if (state.mapId == null) return
  try {
    if (id) window.localStorage.setItem(chosenKey(state.mapId), String(id))
    else window.localStorage.removeItem(chosenKey(state.mapId))
  } catch {
    // Private mode or blocked storage: the choice lasts for this visit only.
  }
}
