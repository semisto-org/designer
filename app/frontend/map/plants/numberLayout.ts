/**
 * Where each plant's numbered pastille goes when plants stand close
 * together (« Numéro » mode), as on a landscape architect's planting plan:
 * - an isolated plant keeps its pastille on its point;
 * - two or three plants that touch: the pastilles step aside by one
 *   pastille at most, a short leader line back to each plant;
 * - four or more (a multi-strata bed seen from afar): one pill for the
 *   cluster, « 125–133 » or « 125 +8 », that opens as one zooms in.
 * Spreading a whole bed sent leader lines everywhere (« un feu d'artifice »,
 * Michael, 2026-11-25): a cluster now says what it holds and waits.
 *
 * Pure (no MapLibre), in screen pixels, tested in test/frontend/plants.
 */
export type NumberPoint = { id: number; x: number; y: number }
export type NumberPlacement = { id: number; x: number; y: number; moved: boolean; free?: boolean }

/**
 * `radius`: the pastille's radius (px, ring included); `gap`: the white space
 * kept between two pastilles. Points are placed in the order given (by
 * number), so the first of a cluster keeps its spot.
 */
export function spreadNumbers(points: NumberPoint[], radius: number, gap = 2, maxRing = 12): NumberPlacement[] {
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
    for (let ring = 1; ring <= maxRing; ring++) {
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
    return { id: p.id, x: p.x, y: p.y, moved: false, free: false }
  })
}

/** A plant to number: its point on screen, its number, and whether it is selected (never hidden in a cluster). */
export type NumberedPoint = NumberPoint & { number: number; selected?: boolean }
export type NumberCluster = { ids: number[]; x: number; y: number; label: string }
export type NumberLayout = { placements: NumberPlacement[]; clusters: NumberCluster[] }

/** Up to this many touching pastilles step aside; more become one cluster pill. */
export const SPREAD_AT_MOST = 3

/** « 125–133 » when the numbers follow each other, else « 125 +8 » (the first, and how many more). */
export function clusterLabel(numbers: number[]): string {
  const sorted = [...numbers].sort((a, b) => a - b)
  const first = sorted[0]
  const last = sorted[sorted.length - 1]
  const consecutive = sorted.every((n, i) => n === first + i)
  return consecutive ? `${first}–${last}` : `${first} +${sorted.length - 1}`
}

/**
 * Lays the pastilles out: plants whose pastilles would touch form a group
 * (touching, directly or through a neighbour). Selected plants keep their
 * pastille on their point, out of any cluster. `placements` lists the
 * pastilles drawn (in the order given), `clusters` the pills, each with the
 * plants it holds.
 */
export function layoutNumbers(points: NumberedPoint[], radius: number, gap = 2): NumberLayout {
  const step = 2 * radius + gap
  const parent = points.map((_, i) => i)
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]]
      i = parent[i]
    }
    return i
  }
  const grid = new Map<string, number[]>()
  const key = (x: number, y: number) => `${Math.floor(x / step)}:${Math.floor(y / step)}`
  points.forEach((p, i) => {
    if (p.selected) return
    const cx = Math.floor(p.x / step)
    const cy = Math.floor(p.y / step)
    for (let a = -1; a <= 1; a++) {
      for (let b = -1; b <= 1; b++) {
        for (const j of grid.get(`${cx + a}:${cy + b}`) ?? []) {
          const q = points[j]
          if ((q.x - p.x) ** 2 + (q.y - p.y) ** 2 < step * step - 1e-6) parent[find(i)] = find(j)
        }
      }
    }
    const k = key(p.x, p.y)
    const list = grid.get(k)
    if (list) list.push(i)
    else grid.set(k, [i])
  })

  const groups = new Map<number, number[]>()
  points.forEach((p, i) => {
    if (p.selected) return
    const root = find(i)
    const group = groups.get(root)
    if (group) group.push(i)
    else groups.set(root, [i])
  })

  const placed = new Map<number, NumberPlacement>()
  const clusters: NumberCluster[] = []
  const cluster = (members: number[]) => {
    const x = members.reduce((s, i) => s + points[i].x, 0) / members.length
    const y = members.reduce((s, i) => s + points[i].y, 0) / members.length
    clusters.push({ ids: members.map((i) => points[i].id), x, y, label: clusterLabel(members.map((i) => points[i].number)) })
  }
  for (const members of groups.values()) {
    if (members.length === 1) {
      const p = points[members[0]]
      placed.set(members[0], { id: p.id, x: p.x, y: p.y, moved: false })
      continue
    }
    if (members.length <= SPREAD_AT_MOST) {
      // By number: the first keeps its spot, the others step aside by one pastille.
      const ordered = [...members].sort((a, b) => points[a].number - points[b].number || a - b)
      const spread = spreadNumbers(ordered.map((i) => ({ id: i, x: points[i].x, y: points[i].y })), radius, gap, 1)
      if (spread.every((s) => s.free !== false)) {
        for (const s of spread) placed.set(s.id, { id: points[s.id].id, x: s.x, y: s.y, moved: s.moved })
        continue
      }
    }
    cluster(members)
  }
  points.forEach((p, i) => {
    if (p.selected) placed.set(i, { id: p.id, x: p.x, y: p.y, moved: false })
  })
  const placements = points.map((_, i) => placed.get(i)).filter((p): p is NumberPlacement => p != null)
  return { placements, clusters }
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
