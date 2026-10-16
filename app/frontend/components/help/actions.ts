// The « Ouvrir le panneau Relief » buttons of a guide. In Markdown:
// [Ouvrir le panneau Relief](action:panel/relief); the server renders them
// as <a href="/maps" data-help-panel="relief" class="help-action">.
// In the map editor the panel opens on the spot; elsewhere the link goes to
// the map opened last (remembered by the quick switcher) with that panel.

/** The editor listens to this event (pages/maps/show.tsx). */
export const OPEN_EDITOR_PANEL = 'editor:open-panel'

const RECENT_KEY = 'designer.quickSwitcher.recent'

function lastMapId(): number | null {
  try {
    const ids = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]')
    return Number.isInteger(ids[0]) ? ids[0] : null
  } catch { return null }
}

/** Where a panel link leads from a page that is not the editor. */
export function panelHref(panel: string, path: string, recent = lastMapId()): string {
  const here = path.match(/^\/maps\/(\d+)/)?.[1]
  const id = here ?? (recent ? String(recent) : null)
  return id ? `/maps/${id}?panel=${encodeURIComponent(panel)}` : '/maps'
}

/**
 * Click handler for a guide's body: true when it handled a panel link.
 * `inEditor` (the help opened over a map) opens the panel without leaving.
 */
export function followHelpAction(event: { target: EventTarget | null; preventDefault: () => void; metaKey?: boolean; ctrlKey?: boolean }, onDone?: () => void): boolean {
  const link = (event.target as HTMLElement | null)?.closest?.('a[data-help-panel]') as HTMLAnchorElement | null
  if (!link || event.metaKey || event.ctrlKey) return false
  const panel = link.dataset.helpPanel!
  if (/^\/maps\/\d+/.test(window.location.pathname)) {
    event.preventDefault()
    window.dispatchEvent(new CustomEvent(OPEN_EDITOR_PANEL, { detail: { panel } }))
    onDone?.()
    return true
  }
  link.href = panelHref(panel, window.location.pathname)
  return false
}
