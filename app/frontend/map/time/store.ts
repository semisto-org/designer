import { useSyncExternalStore } from 'react'
import { DEFAULT_MOMENT, parseMoment, type Moment } from '@/map/time/moment'
import { SEASONS, type Season } from '@/map/time/growth'

/**
 * The moment of the time strip and the noon shade shown with it, per viewer
 * and per map, remembered in localStorage (when the browser allows it).
 * The editor context hands them to panels and layers (`editor.moment`).
 */
type TimeState = { mapId: number | null; moment: Moment; season: Season | null }

let state: TimeState = { mapId: null, moment: DEFAULT_MOMENT, season: null }
const listeners = new Set<() => void>()

const momentKey = (mapId: number) => `designer:map:${mapId}:moment`
const seasonKey = (mapId: number) => `designer:map:${mapId}:shade`

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

/** Loads the moment and shade remembered for this map. */
export function initTime(mapId: number) {
  if (state.mapId === mapId) return
  emit({ mapId, moment: parseMoment(read(momentKey(mapId))), season: parseSeason(read(seasonKey(mapId))) })
}

export function setMoment(moment: Moment) {
  if (state.moment === moment) return
  emit({ ...state, moment })
  if (state.mapId != null) write(momentKey(state.mapId), moment)
}

export function setSeason(season: Season | null) {
  if (state.season === season) return
  emit({ ...state, season })
  if (state.mapId != null) write(seasonKey(state.mapId), season)
}

const serverState: TimeState = { mapId: null, moment: DEFAULT_MOMENT, season: null }

export function useTime(): TimeState {
  return useSyncExternalStore(timeStore.subscribe, timeStore.get, () => serverState)
}
