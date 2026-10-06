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

// The guide card over the map can be folded to one line (per map, per
// browser); it never goes away. null: the person never chose, the editor
// decides (open on a desktop, folded on a phone). The key predates the
// card: a chip hidden before stays folded.
const guideKey = (mapId: number) => `designer.journey.${mapId}.chip-hidden`
const GUIDE_EVENT = 'designer:journey-guide'
const guideMemory = new Map<number, boolean>()

function readGuideCollapsed(mapId: number): boolean | null {
  try {
    const value = window.localStorage.getItem(guideKey(mapId))
    return value === '1' ? true : value === '0' ? false : null
  } catch {
    return guideMemory.get(mapId) ?? null
  }
}

export function useGuideCollapsed(mapId: number): [boolean | null, (collapsed: boolean) => void] {
  const [collapsed, setCollapsed] = useState(() => readGuideCollapsed(mapId))
  useEffect(() => {
    setCollapsed(readGuideCollapsed(mapId))
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent<{ mapId: number; collapsed: boolean }>).detail
      if (detail.mapId === mapId) setCollapsed(detail.collapsed)
    }
    window.addEventListener(GUIDE_EVENT, onChange)
    return () => window.removeEventListener(GUIDE_EVENT, onChange)
  }, [mapId])
  const update = useCallback((value: boolean) => {
    guideMemory.set(mapId, value)
    try {
      window.localStorage.setItem(guideKey(mapId), value ? '1' : '0')
    } catch {
      /* private window: memory only */
    }
    window.dispatchEvent(new CustomEvent(GUIDE_EVENT, { detail: { mapId, collapsed: value } }))
  }, [mapId])
  return [collapsed, update]
}
