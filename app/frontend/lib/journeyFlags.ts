import { useCallback, useEffect, useState } from 'react'

// Journey items only the browser can know ("I opened the layers panel") are
// kept in localStorage, per map. Storage can be unavailable (private window,
// blocked site data): everything degrades to "nothing seen".
const key = (mapId: number) => `designer.journey.${mapId}.seen`
const EVENT = 'designer:journey-seen'
const memory = new Map<number, string[]>()

export function readSeen(mapId: number): string[] {
  try {
    const raw = window.localStorage.getItem(key(mapId))
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : []
  } catch {
    return memory.get(mapId) ?? []
  }
}

export function setSeen(mapId: number, item: string, on = true): string[] {
  const current = readSeen(mapId)
  const next = on ? Array.from(new Set([...current, item])) : current.filter((k) => k !== item)
  if (next.length === current.length && next.every((k) => current.includes(k))) return current
  memory.set(mapId, next)
  try {
    window.localStorage.setItem(key(mapId), JSON.stringify(next))
  } catch {
    /* storage unavailable: the flag lives for this page view only (memory) */
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { mapId, seen: next } }))
  return next
}

export function useSeen(mapId: number): [string[], (item: string, on?: boolean) => void] {
  const [seen, setSeenState] = useState<string[]>(() => readSeen(mapId))
  useEffect(() => {
    setSeenState(readSeen(mapId))
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent<{ mapId: number; seen: string[] }>).detail
      if (detail.mapId === mapId) setSeenState(detail.seen)
    }
    window.addEventListener(EVENT, onChange)
    return () => window.removeEventListener(EVENT, onChange)
  }, [mapId])
  const toggle = useCallback((item: string, on = true) => { setSeen(mapId, item, on) }, [mapId])
  return [seen, toggle]
}

/** Other areas (and our own panels) ask the journey to recompute. */
export const JOURNEY_REFRESH = 'designer:journey-refresh'
export function requestJourneyRefresh() {
  window.dispatchEvent(new Event(JOURNEY_REFRESH))
}

// The journey chip over the map can be hidden (per map, per browser).
const chipKey = (mapId: number) => `designer.journey.${mapId}.chip-hidden`
const CHIP_EVENT = 'designer:journey-chip'
const chipMemory = new Map<number, boolean>()

function readChipHidden(mapId: number): boolean {
  try {
    return window.localStorage.getItem(chipKey(mapId)) === '1'
  } catch {
    return chipMemory.get(mapId) ?? false
  }
}

export function useChipHidden(mapId: number): [boolean, (hidden: boolean) => void] {
  const [hidden, setHidden] = useState(() => readChipHidden(mapId))
  useEffect(() => {
    setHidden(readChipHidden(mapId))
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent<{ mapId: number; hidden: boolean }>).detail
      if (detail.mapId === mapId) setHidden(detail.hidden)
    }
    window.addEventListener(CHIP_EVENT, onChange)
    return () => window.removeEventListener(CHIP_EVENT, onChange)
  }, [mapId])
  const update = useCallback((value: boolean) => {
    chipMemory.set(mapId, value)
    try {
      if (value) window.localStorage.setItem(chipKey(mapId), '1')
      else window.localStorage.removeItem(chipKey(mapId))
    } catch {
      /* private window: memory only */
    }
    window.dispatchEvent(new CustomEvent(CHIP_EVENT, { detail: { mapId, hidden: value } }))
  }, [mapId])
  return [hidden, update]
}
