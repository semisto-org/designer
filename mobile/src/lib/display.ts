// The terrain map's display settings, one per map, kept on the phone.
import { useSyncExternalStore } from 'react'
import { DEFAULT_DISPLAY, parseDisplay, reveal, type Display, type Properties } from './display-core'
import { readJson, writeJson } from './storage'
import type { Planting } from './types'

const FILE = 'display.json'
let saved: Record<string, Display> | null = null
const listeners = new Set<() => void>()

function all(): Record<string, Display> {
  if (!saved) {
    const raw = readJson<Record<string, unknown>>(FILE) ?? {}
    saved = Object.fromEntries(Object.entries(raw).map(([id, value]) => [id, parseDisplay(value)]))
  }
  return saved
}

export const display = {
  get: (mapId: number): Display => all()[String(mapId)] ?? DEFAULT_DISPLAY,
  set(mapId: number, next: Display) {
    saved = { ...all(), [String(mapId)]: next }
    writeJson(FILE, saved)
    listeners.forEach((listener) => listener())
  },
  /** Shows a feature the person just added, if the display hid it. */
  reveal(mapId: number, properties: Properties, planting: Planting | undefined) {
    const current = display.get(mapId)
    const next = reveal(current, properties, planting)
    if (next !== current) display.set(mapId, next)
  },
  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => { listeners.delete(listener) }
  },
}

export function useDisplay(mapId: number): Display {
  return useSyncExternalStore(display.subscribe, () => display.get(mapId))
}
