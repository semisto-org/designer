import { useSyncExternalStore } from 'react'
import { DEFAULT_MOMENT, parseMoment, type Moment } from '@/map/time/moment'
import { SEASONS, type Season } from '@/map/time/growth'
import { modeForMoment, modeForStage, momentForMode, parseMode, type DesignMode } from '@/map/time/mode'

/**
 * The moment of the time strip, the noon shade shown with it and the mode
 * (« Existant » or « Projet », map/time/mode), per viewer and per map,
 * remembered in localStorage (when the browser allows it). The editor
 * context hands them to panels and layers (`editor.moment`, `editor.mode`).
 * Mode and moment hold each other: « Arrivée » is seen in « Existant », the
 * years to come in « Projet ».
 */
type TimeState = { mapId: number | null; moment: Moment; season: Season | null; mode: DesignMode }

let state: TimeState = { mapId: null, moment: DEFAULT_MOMENT, season: null, mode: 'project' }
const listeners = new Set<() => void>()

const momentKey = (mapId: number) => `designer:map:${mapId}:moment`
const seasonKey = (mapId: number) => `designer:map:${mapId}:shade`
const modeKey = (mapId: number) => `designer:map:${mapId}:mode`

function emit(next: TimeState) {
  state = next
  listeners.forEach((listener) => listener())
}

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string | null) {
  try {
    if (value == null) window.localStorage.removeItem(key)
    else window.localStorage.setItem(key, value)
  } catch {
    // Private mode or blocked storage: the choice lasts for this visit only.
  }
}

export const timeStore = {
  get: () => state,
  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },
}

export const parseSeason = (value: unknown): Season | null => (SEASONS.includes(value as Season) ? (value as Season) : null)

/**
 * Loads the moment, shade and mode remembered for this map; without a mode
 * remembered, the map's step decides it (observe and map the land, then
 * design and plant the project).
 */
export function initTime(mapId: number, stage?: string | null) {
  if (state.mapId === mapId) return
  const mode = parseMode(read(modeKey(mapId))) ?? modeForStage(stage)
  emit({ mapId, moment: momentForMode(parseMoment(read(momentKey(mapId))), mode), season: parseSeason(read(seasonKey(mapId))), mode })
}

function save(next: TimeState) {
  emit(next)
  if (next.mapId == null) return
  write(momentKey(next.mapId), next.moment)
  write(modeKey(next.mapId), next.mode)
}

/** Shows a moment of the strip; « Arrivée » brings « Existant », the years to come « Projet ». */
export function setMoment(moment: Moment) {
  if (state.moment === moment) return
  save({ ...state, moment, mode: modeForMoment(state.mode, moment) })
}

/** Shows the land alone or the project over it; a moment of the other mode comes back to today. */
export function setMode(mode: DesignMode) {
  if (state.mode === mode) return
  save({ ...state, mode, moment: momentForMode(state.moment, mode) })
}

export function setSeason(season: Season | null) {
  if (state.season === season) return
  emit({ ...state, season })
  if (state.mapId != null) write(seasonKey(state.mapId), season)
}

const serverState: TimeState = { mapId: null, moment: DEFAULT_MOMENT, season: null, mode: 'project' }

export function useTime(): TimeState {
  return useSyncExternalStore(timeStore.subscribe, timeStore.get, () => serverState)
}
