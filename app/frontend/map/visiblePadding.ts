/**
 * Where to fly to so the target lands in the part of the map the open panel
 * does not cover: the left column on a desktop, the lower half (a sheet) on a
 * phone. `visiblePadding` is for `fitBounds` (which does not keep it);
 * `visibleOffset` is for `easeTo` / `flyTo` (their `padding` would persist on
 * the map and shift every later move).
 */
const isDesktop = () => typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches
const viewportHeight = () => (typeof window !== 'undefined' ? window.innerHeight : 700)

export function visiblePadding(panelOpen: boolean, margin = 60): { top: number; bottom: number; left: number; right: number } {
  if (!panelOpen) return { top: margin, bottom: margin, left: margin, right: margin }
  if (isDesktop()) return { top: margin, bottom: margin, left: 360 + margin, right: margin }
  return { top: margin + 40, bottom: Math.round(viewportHeight() * 0.55), left: 40, right: 40 }
}

/** Pixels to shift the target from the map's center (x right, y down). */
export function visibleOffset(panelOpen: boolean): [number, number] {
  if (!panelOpen) return [0, 0]
  if (isDesktop()) return [180, 0]
  return [0, -Math.round(viewportHeight() * 0.22)]
}
