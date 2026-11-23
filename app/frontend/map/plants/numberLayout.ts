/**
 * Where each plant's numbered pastille goes when plants stand close
 * together (« Numéro » mode): a pastille that would touch one already placed
 * steps aside, to the nearest free spot around its plant, and a thin leader
 * line ties it back to its point, as on a landscape architect's planting
 * plan. Isolated plants keep their pastille on their point.
 *
 * Pure (no MapLibre), in screen pixels, tested in test/frontend/plants.
 */
export type NumberPoint = { id: number; x: number; y: number }
export type NumberPlacement = { id: number; x: number; y: number; moved: boolean }

/**
 * `radius`: the pastille's radius (px, ring included); `gap`: the white space
 * kept between two pastilles. Points are placed in the order given (by
 * number), so the first of a cluster keeps its spot.
 */
export function spreadNumbers(points: NumberPoint[], radius: number, gap = 2): NumberPlacement[] {
  const step = 2 * radius + gap
  const cell = step
  const grid = new Map<string, { x: number; y: number }[]>()
  const key = (cx: number, cy: number) => `${cx}:${cy}`
  const near = (x: number, y: number) => {
    const cx = Math.floor(x / cell)
    const cy = Math.floor(y / cell)
    const out: { x: number; y: number }[] = []
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) out.push(...(grid.get(key(cx + i, cy + j)) ?? []))
    return out
  }
  const free = (x: number, y: number) => near(x, y).every((p) => (p.x - x) ** 2 + (p.y - y) ** 2 >= step * step - 1e-6)
  const place = (x: number, y: number) => {
    const k = key(Math.floor(x / cell), Math.floor(y / cell))
    const list = grid.get(k)
    if (list) list.push({ x, y })
    else grid.set(k, [{ x, y }])
  }

  // Plant points, to keep a pastille that steps aside from covering another plant.
  const anchors = new Map<string, NumberPoint[]>()
  for (const p of points) {
    const k = key(Math.floor(p.x / cell), Math.floor(p.y / cell))
    const list = anchors.get(k)
    if (list) list.push(p)
    else anchors.set(k, [p])
  }
  const covered = (x: number, y: number, self: number) => {
    const cx = Math.floor(x / cell)
    const cy = Math.floor(y / cell)
    let count = 0
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        for (const a of anchors.get(key(cx + i, cy + j)) ?? []) {
          if (a.id !== self && (a.x - x) ** 2 + (a.y - y) ** 2 < radius * radius) count++
        }
      }
    }
    return count
  }

  return points.map((p) => {
    if (free(p.x, p.y)) {
      place(p.x, p.y)
      return { id: p.id, x: p.x, y: p.y, moved: false }
    }
    // Away from the crowd: the side opposite the pastilles around it comes first.
    const around = near(p.x, p.y)
    const mx = around.reduce((s, q) => s + q.x, 0) / Math.max(1, around.length) - p.x
    const my = around.reduce((s, q) => s + q.y, 0) / Math.max(1, around.length) - p.y
    const away = mx === 0 && my === 0 ? -Math.PI / 2 : Math.atan2(-my, -mx)
    for (let ring = 1; ring <= 12; ring++) {
      const distance = step * ring
      const count = 8 * ring
      let best: { x: number; y: number; cost: number } | null = null
      for (let i = 0; i < count; i++) {
        // Alternating around the « away » direction: 0, +1, -1, +2, -2…
        const turn = i === 0 ? 0 : (i % 2 === 1 ? 1 : -1) * Math.ceil(i / 2)
        const angle = away + (turn * 2 * Math.PI) / count
        const x = p.x + Math.cos(angle) * distance
        const y = p.y + Math.sin(angle) * distance
        if (!free(x, y)) continue
        const cost = covered(x, y, p.id) * 1000 + Math.abs(turn)
        if (!best || cost < best.cost) best = { x, y, cost }
        if (cost === 0) break
      }
      if (best) {
        place(best.x, best.y)
        return { id: p.id, x: best.x, y: best.y, moved: true }
      }
    }
    // Never left without a place: on its point, as before.
    place(p.x, p.y)
    return { id: p.id, x: p.x, y: p.y, moved: false }
  })
}

/** The pastille's radius (px) at a zoom, ring included: the `plant-numbers-disc` circle radius plus its widest stroke. */
export function pastilleRadius(zoom: number): number {
  const stops: [number, number][] = [[15, 6], [17, 9], [20, 13]]
  let r = stops[stops.length - 1][1]
  if (zoom <= stops[0][0]) r = stops[0][1]
  else {
    for (let i = 1; i < stops.length; i++) {
      const [z0, r0] = stops[i - 1]
      const [z1, r1] = stops[i]
      if (zoom <= z1) {
        r = r0 + ((r1 - r0) * (zoom - z0)) / (z1 - z0)
        break
      }
    }
  }
  return r + 1.5
}
