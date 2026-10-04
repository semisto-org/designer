import { useCallback, useEffect, useState } from 'react'
import { DOSSIER_SECTIONS, type DossierPrefs, type DossierSection } from '@/types/dossier'

// What to print is remembered per map, in this browser only. Storage can be
// unavailable (private window, blocked site data): the choice then lives
// for this page view. Including networks is never remembered: a sensitive
// inclusion is a deliberate choice, each time.
const key = (mapId: number) => `designer.dossier.${mapId}`

export const DEFAULT_SECTIONS: Record<DossierSection, boolean> = Object.fromEntries(
  DOSSIER_SECTIONS.map((section) => [section, true]),
) as Record<DossierSection, boolean>

export const DEFAULT_PREFS: DossierPrefs = { sections: DEFAULT_SECTIONS, photos: null, cadastre: true }

function read(mapId: number): DossierPrefs {
  try {
    const raw = window.localStorage.getItem(key(mapId))
    const parsed = raw ? (JSON.parse(raw) as Partial<DossierPrefs>) : {}
    const sections = { ...DEFAULT_SECTIONS }
    if (parsed.sections && typeof parsed.sections === 'object') {
      for (const section of DOSSIER_SECTIONS) {
        const value = (parsed.sections as Record<string, unknown>)[section]
        if (typeof value === 'boolean') sections[section] = value
      }
    }
    const photos = Array.isArray(parsed.photos) ? parsed.photos.filter((id): id is number => Number.isInteger(id)) : null
    return { sections, photos, cadastre: typeof parsed.cadastre === 'boolean' ? parsed.cadastre : true }
  } catch {
    return DEFAULT_PREFS
  }
}

function write(mapId: number, prefs: DossierPrefs) {
  try {
    window.localStorage.setItem(key(mapId), JSON.stringify(prefs))
  } catch {
    /* storage unavailable: the choice lasts for this page view */
  }
}

export function useDossierPrefs(mapId: number) {
  const [prefs, setPrefs] = useState<DossierPrefs>(() => read(mapId))
  useEffect(() => setPrefs(read(mapId)), [mapId])

  const update = useCallback((change: Partial<DossierPrefs>) => {
    setPrefs((current) => {
      const next = { ...current, ...change }
      write(mapId, next)
      return next
    })
  }, [mapId])

  const reset = useCallback(() => {
    write(mapId, DEFAULT_PREFS)
    setPrefs(DEFAULT_PREFS)
  }, [mapId])

  return { prefs, update, reset }
}
