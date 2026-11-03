import { useSyncExternalStore } from 'react'
import type { OverlayArc } from '@/map/sectors/overlay'
import { groupsFromParam, isSectorGroup, type SectorGroup } from '@/map/sectors/sectors'

export type SeasonFilter = 'all' | 'winter' | 'summer'

/**
 * How the editor shows the sector analysis, for this viewer and this map:
 * whether the arcs stay on the map once the « Secteurs » panel is closed
 * (to present a design), which groups are hidden (sun, winds, risks…),
 * the season looked at, and the arc being edited in the panel. The first
 * two are remembered in localStorage.
 */
export type SectorView = {
  mapId: number | null
  onMap: boolean
  hiddenGroups: SectorGroup[]
  season: SeasonFilter
  /** The arc of the sector being edited, drawn in place of the saved one. */
  editing: { id: number | null; arc: OverlayArc | null } | null
}

let state: SectorView = { mapId: null, onMap: false, hiddenGroups: [], season: 'all', editing: null }
const listeners = new Set<() => void>()

function set(patch: Partial<SectorView>) {
  state = { ...state, ...patch }
  listeners.forEach((listener) => listener())
}

const storageKey = (mapId: number) => `designer:map:${mapId}:sectors-view`

function save() {
  if (state.mapId == null) return
  try {
    window.localStorage.setItem(storageKey(state.mapId), JSON.stringify({ onMap: state.onMap, hiddenGroups: state.hiddenGroups }))
  } catch {
    // Private mode or blocked storage: the choice lasts for this visit only.
  }
}

function read(mapId: number): Pick<SectorView, 'onMap' | 'hiddenGroups'> {
  try {
    const saved = JSON.parse(window.localStorage.getItem(storageKey(mapId)) ?? '{}')
    return {
      onMap: saved?.onMap === true,
      hiddenGroups: Array.isArray(saved?.hiddenGroups) ? saved.hiddenGroups.filter(isSectorGroup) : [],
    }
  } catch {
    return { onMap: false, hiddenGroups: [] }
  }
}

/**
 * Loads what this viewer chose for the map. `?sectors=sun,wind` (a link
 * given by an AI, or kept to present a design) shows those groups on the
 * map and hides the others, then leaves the address.
 */
export function initSectorView(mapId: number) {
  if (state.mapId === mapId) return
  state = { ...state, mapId, ...read(mapId), season: 'all', editing: null }
  if (typeof window !== 'undefined') {
    const url = new URL(window.location.href)
    if (url.searchParams.has('sectors')) {
      const asked = groupsFromParam(url.searchParams.get('sectors'))
      url.searchParams.delete('sectors')
      window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash)
      if (asked) {
        state = { ...state, onMap: true, hiddenGroups: asked.hidden }
        save()
      }
    }
  }
  listeners.forEach((listener) => listener())
}

export const sectorView = {
  get: () => state,
  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },
  setOnMap(onMap: boolean) {
    set({ onMap })
    save()
  },
  setHiddenGroups(hiddenGroups: SectorGroup[]) {
    set({ hiddenGroups })
    save()
  },
  toggleGroup(group: SectorGroup) {
    const hidden = state.hiddenGroups.includes(group) ? state.hiddenGroups.filter((g) => g !== group) : [...state.hiddenGroups, group]
    sectorView.setHiddenGroups(hidden)
  },
  setSeason(season: SeasonFilter) {
    set({ season })
  },
  setEditing(editing: SectorView['editing']) {
    if (JSON.stringify(editing) !== JSON.stringify(state.editing)) set({ editing })
  },
}

export function useSectorView(): SectorView {
  return useSyncExternalStore(sectorView.subscribe, () => state)
}
