import { useSyncExternalStore } from 'react'
import { ApiError, api } from '@/lib/api'
import { t } from '@/lib/i18n'
import { MAX_PAIRS, type AlignPair, type LngLat } from '@/drone/alignment'
import { importsStore } from '@/drone/imports'
import type { AerialImport } from '@/types/drone'

/**
 * « Recaler la vue »: the drone view being lined up and the landmark pairs
 * placed so far. A pair starts with its point on the drone view (`from`),
 * then gets where that point really is (`to`). Shared by the « Couches »
 * panel (which starts it) and the overlay on the map (markers, preview,
 * the bar with « Recaler »).
 */
export type DraftPair = { from: LngLat; to: LngLat | null }

export type AlignState = {
  viewId: number | null
  pairs: DraftPair[]
  /** The drone view half transparent, to see the map under it. */
  seeThrough: boolean
  saving: boolean
  error: string | null
}

const IDLE: AlignState = { viewId: null, pairs: [], seeThrough: false, saving: false, error: null }

let state: AlignState = IDLE
const listeners = new Set<() => void>()

function set(patch: Partial<AlignState>) {
  state = { ...state, ...patch }
  listeners.forEach((listener) => listener())
}

/** The pairs with both ends, which move the preview and go to the server. */
export function completePairs(pairs: DraftPair[]): AlignPair[] {
  return pairs.filter((p): p is AlignPair => p.to != null)
}

/** What the next click places: a point on the view, its real place, or nothing more. */
export function nextStep(pairs: DraftPair[]): 'from' | 'to' | 'full' {
  const last = pairs[pairs.length - 1]
  if (last && last.to == null) return 'to'
  return pairs.length >= MAX_PAIRS ? 'full' : 'from'
}

export const alignStore = {
  get: () => state,
  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },

  start(viewId: number) {
    set({ ...IDLE, viewId })
  },
  cancel() {
    set(IDLE)
  },

  /** A click on the map: the next end of the current pair, or a new pair. */
  place(point: LngLat) {
    const step = nextStep(state.pairs)
    if (step === 'full') return
    const pairs = step === 'to'
      ? state.pairs.map((p, i) => (i === state.pairs.length - 1 ? { ...p, to: point } : p))
      : [...state.pairs, { from: point, to: null }]
    // The real place is clicked on the map: the view goes see-through for it.
    set({ pairs, seeThrough: nextStep(pairs) === 'to' ? true : state.seeThrough, error: null })
  },
  move(index: number, end: 'from' | 'to', point: LngLat) {
    set({ pairs: state.pairs.map((p, i) => (i === index ? { ...p, [end]: point } : p)), error: null })
  },
  removeLast() {
    set({ pairs: state.pairs.slice(0, -1), error: null })
  },
  toggleSeeThrough() {
    set({ seeThrough: !state.seeThrough })
  },

  async submit(mapId: number): Promise<AerialImport | null> {
    const pairs = completePairs(state.pairs)
    if (state.viewId == null || pairs.length === 0 || state.saving) return null
    set({ saving: true, error: null })
    try {
      const { aerialView } = await api<{ aerialView: AerialImport }>(`/maps/${mapId}/aerial_views/${state.viewId}/align`, {
        method: 'POST',
        body: { pairs },
      })
      importsStore.replace(aerialView)
      set(IDLE)
      return aerialView
    } catch (error) {
      set({ saving: false, error: error instanceof ApiError && typeof error.data.message === 'string' ? error.data.message : t('drone.align.errors.network') })
      return null
    }
  },
}

export function useAlign(): AlignState {
  return useSyncExternalStore(alignStore.subscribe, alignStore.get, alignStore.get)
}
