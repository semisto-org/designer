import { useEffect } from 'react'

/** The `?open=ID` of the address: the photo or document a link asks to open. */
export function readOpenParam(): number | null {
  if (typeof window === 'undefined') return null
  return Number(new URLSearchParams(window.location.search).get('open')) || null
}

/**
 * Keeps `?open=ID` in the address while a photo or a document is open (and
 * takes it away when it closes), so that the address bar, a bookmark or a
 * link copied from it reopens this very view. Replaces the history entry:
 * the back button still leaves the page instead of stepping through photos.
 */
export function useOpenParam(openId: number | null, enabled = true) {
  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return
    const url = new URL(window.location.href)
    const current = url.searchParams.get('open')
    if (openId == null ? current == null : current === String(openId)) return
    if (openId == null) url.searchParams.delete('open')
    else url.searchParams.set('open', String(openId))
    window.history.replaceState(window.history.state, '', url)
  }, [openId, enabled])
}
