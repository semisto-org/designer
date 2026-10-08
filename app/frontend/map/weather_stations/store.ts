import { useSyncExternalStore } from 'react'

/**
 * Shared by the « Stations météo proches » section (in the « Climat » panel)
 * and the map overlay, which live in different parts of the editor:
 * whether the stations are drawn, and the station chosen on the map.
 */
export type WeatherStationsState = {
  showOnMap: boolean
  /** Station clicked on the map or in the list; null = the nearest. */
  selectedCode: number | null
  /** Bumped on each click on the map, so the section scrolls into view again. */
  focusTick: number
}

const STORAGE_KEY = 'designer.weatherStations.showOnMap'

function readShowOnMap(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

let state: WeatherStationsState = { showOnMap: readShowOnMap(), selectedCode: null, focusTick: 0 }
const listeners = new Set<() => void>()

function set(patch: Partial<WeatherStationsState>) {
  state = { ...state, ...patch }
  listeners.forEach((listener) => listener())
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export const useWeatherStations = (): WeatherStationsState => useSyncExternalStore(subscribe, () => state)

export const weatherStationsActions = {
  setShowOnMap(showOnMap: boolean) {
    try {
      window.localStorage.setItem(STORAGE_KEY, String(showOnMap))
    } catch {
      // Private window: the choice lasts until the page is closed.
    }
    set({ showOnMap })
  },
  select(code: number | null) {
    set({ selectedCode: code })
  },
  /** A station clicked on the map: show it and bring the section into view. */
  focus(code: number) {
    set({ selectedCode: code, focusTick: state.focusTick + 1 })
  },
  reset() {
    set({ selectedCode: null, focusTick: 0 })
  },
}
