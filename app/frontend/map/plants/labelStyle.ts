import { useSyncExternalStore } from 'react'
import type { PlantLabelStyle } from '@/map/plants/labelRank'

/**
 * How the viewer wants plants named on the map (« Nom » or « Code »), kept
 * in localStorage for all their maps.
 */
const KEY = 'designer.plantLabels'
const listeners = new Set<() => void>()

function read(): PlantLabelStyle {
  try {
    return window.localStorage.getItem(KEY) === 'code' ? 'code' : 'name'
  } catch {
    return 'name'
  }
}

let current: PlantLabelStyle | null = null

export const plantLabelStyleStore = {
  get: (): PlantLabelStyle => (current ??= read()),
  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },
}

export function setPlantLabelStyle(style: PlantLabelStyle) {
  current = style
  try {
    window.localStorage.setItem(KEY, style)
  } catch {
    // Private browsing: the choice lasts until the page closes.
  }
  listeners.forEach((listener) => listener())
}

export function usePlantLabelStyle(): PlantLabelStyle {
  return useSyncExternalStore(plantLabelStyleStore.subscribe, plantLabelStyleStore.get, () => 'name')
}
