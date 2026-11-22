import { useSyncExternalStore } from 'react'
import { isSheet, sheetOf, sheetRank, type Sheet } from './sheets'

/**
 * The tracing sheet on the table, chosen by this viewer for this map
 * (localStorage), or null: every sheet shows, as before. Shared by the
 * sheet card, the toolbar and the map's paint (TracingOverlay).
 */
type State = { mapId: number | null; sheet: Sheet | null }

let state: State = { mapId: null, sheet: null }
const listeners = new Set<() => void>()

const storageKey = (mapId: number) => `designer:map:${mapId}:tracing`

function emit() {
  listeners.forEach((listener) => listener())
}

export function initTracing(mapId: number) {
  if (state.mapId === mapId) return
  let saved: string | null = null
  try {
    saved = window.localStorage.getItem(storageKey(mapId))
  } catch {
    saved = null
  }
  state = { mapId, sheet: isSheet(saved) ? saved : null }
  emit()
}

export function setSheet(sheet: Sheet | null) {
  if (state.sheet === sheet) return
  state = { ...state, sheet }
  emit()
  if (state.mapId == null) return
  try {
    if (sheet) window.localStorage.setItem(storageKey(state.mapId), sheet)
    else window.localStorage.removeItem(storageKey(state.mapId))
  } catch {
    // Private mode or blocked storage: the choice lasts for this visit only.
  }
}

export const tracingStore = { get: () => state }

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useSheet(): Sheet | null {
  return useSyncExternalStore(subscribe, () => state.sheet, () => state.sheet)
}

/**
 * What one just drew is never hidden: drawn on a sheet above the one on
 * the table (a pond while the bubbles are out), it lays that sheet on the
 * table. Returns the sheet laid, or null. Called by the editor for this
 * person's own drawings only, never for a collaborator's.
 */
export function liftSheetFor(properties: Parameters<typeof sheetOf>[0]): Sheet | null {
  const own = sheetOf(properties)
  if (!state.sheet || !own || sheetRank(own) <= sheetRank(state.sheet)) return null
  setSheet(own)
  return own
}
