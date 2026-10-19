// The little places drawn on each plan of « Tarifs »: as many plots as the
// plan has active maps, side by side like a patchwork seen from the air, each
// with a few watercolour crowns. Pure geometry, no DOM: tested in
// test/frontend/site.

export type Point = [number, number]
export type Crown = { x: number; y: number; r: number; kind: 'tree' | 'shrub' | 'pond' }
export type Lot = { poly: Point[]; crowns: Crown[] }

function rng(seed: number) {
  let s = seed % 2147483647
  if (s <= 0) s += 2147483646
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}

/**
 * `count` plots in a `w` × `h` drawing: a grid as square as the drawing
 * allows, each cell shrunk and shaken so that no two plots look alike, with
 * crowns inside (fewer and smaller when the plots are many).
 */
export function lots(count: number, w: number, h: number, seed = 7): Lot[] {
  if (count <= 0) return []
  const random = rng(seed + count * 101)
  const cols = Math.max(1, Math.round(Math.sqrt((count * w) / h)))
  const rows = Math.ceil(count / cols)
  const cw = w / cols
  const ch = h / rows
  const out: Lot[] = []
  for (let i = 0; i < count; i++) {
    const col = i % cols
    // The last row is centred when it is not full.
    const inRow = Math.min(cols, count - Math.floor(i / cols) * cols)
    const row = Math.floor(i / cols)
    const x0 = col * cw + ((cols - inRow) * cw) / 2
    const y0 = row * ch
    const pad = Math.min(cw, ch) * (count === 1 ? 0.08 : 0.12)
    const jitter = Math.min(cw, ch) * 0.07
    const corners: Point[] = [[x0 + pad, y0 + pad], [x0 + cw - pad, y0 + pad], [x0 + cw - pad, y0 + ch - pad], [x0 + pad, y0 + ch - pad]]
    // Six to eight corners: a plot is rarely a rectangle.
    const poly: Point[] = []
    corners.forEach((corner, k) => {
      const next = corners[(k + 1) % 4]
      poly.push([corner[0] + (random() - 0.5) * jitter * 2, corner[1] + (random() - 0.5) * jitter * 2])
      if (random() < 0.6) {
        const t = 0.35 + random() * 0.3
        poly.push([corner[0] + (next[0] - corner[0]) * t + (random() - 0.5) * jitter * 2, corner[1] + (next[1] - corner[1]) * t + (random() - 0.5) * jitter * 2])
      }
    })
    const inner = { x: x0 + pad * 1.8, y: y0 + pad * 1.8, w: cw - pad * 3.6, h: ch - pad * 3.6 }
    const side = Math.min(inner.w, inner.h)
    const n = count === 1 ? 9 : count <= 3 ? 6 : count <= 6 ? 4 : 2
    const crowns: Crown[] = []
    if (count <= 6 && random() < 0.7) crowns.push({ x: inner.x + inner.w * (0.15 + random() * 0.2), y: inner.y + inner.h * (0.6 + random() * 0.25), r: side * 0.16, kind: 'pond' })
    for (let k = 0; k < n; k++) {
      const tree = k % 3 !== 2
      // A big plot gets smaller crowns, spread over all of it.
      const r = side * (count === 1 ? 0.6 : 1) * (tree ? 0.17 + random() * 0.08 : 0.1 + random() * 0.05)
      // Crowns stay inside their plot.
      const room = (extent: number) => Math.max(0, extent - 2 * r * 0.8)
      crowns.push({
        x: inner.x + r * 0.8 + random() * room(inner.w),
        y: inner.y + r * 0.8 + random() * room(inner.h),
        r,
        kind: tree ? 'tree' : 'shrub',
      })
    }
    out.push({ poly, crowns })
  }
  return out
}
