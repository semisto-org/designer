/**
 * Where to fly to so the target lands in the part of the map the side cards
 * do not cover: between the open panel (left zone) and the element sheet
 * (right zone) on a desktop, the upper part above the sheet on a phone. The
 * zones publish their widths on the map (map/layout/ZoneLayer); a panel just
 * asked for, not drawn yet, counts at its usual width. `visiblePadding` is
 * for `fitBounds` (which does not keep it); `visibleOffset` is for `easeTo` /
 * `flyTo` (their `padding` would persist on the map and shift every later move).
 */
const isDesktop = () => typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches
const viewportHeight = () => (typeof window !== 'undefined' ? window.innerHeight : 700)

/** The panel's column (w-80 and its gutters), until the zone measures it. */
const PANEL_PX = 336

/** Widths the side zones take right now, in pixels. */
export function zoneWidths(): { left: number; right: number } {
  if (typeof document === 'undefined') return { left: 0, right: 0 }
  const map = document.querySelector<HTMLElement>('.editor-map')
  if (!map) return { left: 0, right: 0 }
  const style = getComputedStyle(map)
  const read = (name: string) => Number.parseFloat(style.getPropertyValue(name)) || 0
  return { left: read('--zone-left'), right: read('--zone-right') }
}

export function visiblePadding(panelOpen: boolean, margin = 60): { top: number; bottom: number; left: number; right: number } {
  if (isDesktop()) {
    const zones = zoneWidths()
    // Without a panel the left zone holds at most the version pill, too small to plan around.
    const left = panelOpen ? Math.max(zones.left, PANEL_PX) : 0
    return { top: margin, bottom: margin, left: left + margin, right: zones.right + margin }
  }
  if (!panelOpen) return { top: margin, bottom: margin, left: margin, right: margin }
  return { top: margin + 40, bottom: Math.round(viewportHeight() * 0.55), left: 40, right: 40 }
}

/** Pixels to shift the target from the map's center (x right, y down). */
export function visibleOffset(panelOpen: boolean): [number, number] {
  if (isDesktop()) {
    const zones = zoneWidths()
    const left = panelOpen ? Math.max(zones.left, PANEL_PX) : 0
    return [Math.round((left - zones.right) / 2), 0]
  }
  if (!panelOpen) return [0, 0]
  return [0, -Math.round(viewportHeight() * 0.22)]
}
