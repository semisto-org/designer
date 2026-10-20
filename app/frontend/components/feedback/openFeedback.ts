// « Un retour ? » opens from the editor's header and the app's header with
// this event; FirstHourHost, mounted once (ImpersonationFrame), listens to it.
export const OPEN_FEEDBACK = 'feedback:open'

export function openFeedback() {
  window.dispatchEvent(new CustomEvent(OPEN_FEEDBACK))
}

/** The map of the page, from its address (/maps/12, /maps/12/palette…). */
export function mapIdFromPath(path: string): number | null {
  const match = /^\/maps\/(\d+)(?:\/|$)/.exec(path)
  return match ? Number(match[1]) : null
}
