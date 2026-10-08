// Types and pure helpers for « Le climat observé ici » (ERA5-Land,
// 1995–2024). No React and no '@/' imports, so node can test them.

export type ObservedMonth = { month: number; meanTempC: number | null; meanMinC: number | null; meanMaxC: number | null; rainMm: number }

export type ObservedDecade = {
  from: number; to: number
  meanTempC: number | null; rainMm: number | null; annualMinC: number | null; gddBase10: number | null
  hotDays: number | null; frostFreeDays: number | null; lastSpringFrostDoy: number | null; firstAutumnFrostDoy: number | null
}

export type ObservedClimateData = {
  years: number
  firstYear: number
  lastYear: number
  annual: {
    meanTempC: number | null; rainMm: number | null; annualMinC: number | null; coldestC: number | null
    gddBase10: number | null; hotDays: number | null; frostDays: number | null; frostFreeDays: number | null
  }
  zone: { code: string } | null
  months: ObservedMonth[]
  frost: {
    lastSpring: { mean: string | null; late: string | null; yearsWith: number }
    firstAutumn: { mean: string | null; early: string | null; yearsWith: number }
    frostFreeDays: number | null
  }
  trend: { first: ObservedDecade; last: ObservedDecade; delta: Partial<Record<keyof ObservedDecade, number | null>> } | null
}

export type ObservedClimateSource = { key: string; publisher: string; title: string; licence: string; url: string; doi: string; year: number }

export type ObservedClimateReport =
  | { available: false; reason: 'not_configured' | 'no_location' }
  | {
      available: true
      status: 'pending' | 'ready' | 'failed'
      period: { firstYear: number; lastYear: number }
      gridKm: number
      computedAt: string | null
      data: ObservedClimateData | null
      source: ObservedClimateSource
    }

const MONTH_STARTS = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334, 365]

/** "04-18" -> 108 (day of a non-leap year, 1-based); null when unreadable. */
export function dayOfYear(monthDay: string | null | undefined): number | null {
  if (!monthDay) return null
  const [month, day] = monthDay.split('-').map(Number)
  if (!month || !day || month > 12) return null
  return MONTH_STARTS[month - 1] + day
}

/** Day of the year of a JS date, in a non-leap year (29 February -> 59). */
export function dayOfYearOf(date: Date): number {
  return MONTH_STARTS[date.getMonth()] + Math.min(date.getDate(), date.getMonth() === 1 ? 28 : 31)
}

/** Position 0..1 of a day of the year across the year. */
export function yearFraction(doy: number): number {
  return Math.min(1, Math.max(0, (doy - 1) / 365))
}

/** Indexes (0-11) of the wettest and the driest month. */
export function wettestAndDriest(months: ObservedMonth[]): { wettest: number; driest: number } | null {
  if (months.length !== 12) return null
  let wettest = 0
  let driest = 0
  months.forEach((m, i) => {
    if (m.rainMm > months[wettest].rainMm) wettest = i
    if (m.rainMm < months[driest].rainMm) driest = i
  })
  return { wettest, driest }
}

/** Frost is "rare" when it comes in fewer than half of the years. */
export function frostIsRare(yearsWith: number, years: number): boolean {
  return years > 0 && yearsWith * 2 < years
}

/** Small deterministic random numbers, so the hand-drawn wobble stays put between renders. */
export function seeded(seed: number): () => number {
  let s = seed >>> 0 || 1
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

/**
 * An SVG path through points, drawn like a pencil line: a smooth curve
 * (Catmull-Rom as cubic Béziers) whose points wobble by up to `wobble` px.
 */
export function pencilPath(points: [number, number][], wobble = 0.8, seed = 7): string {
  if (points.length === 0) return ''
  const rand = seeded(seed)
  const p = points.map(([x, y]) => [x + (rand() - 0.5) * wobble, y + (rand() - 0.5) * wobble] as [number, number])
  let d = `M${p[0][0].toFixed(1)},${p[0][1].toFixed(1)}`
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[i - 1] ?? p[i]
    const p1 = p[i]
    const p2 = p[i + 1]
    const p3 = p[i + 2] ?? p2
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6]
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6]
    d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`
  }
  return d
}

/** A watercolour bar: a rectangle with a slightly uneven, rounded top. */
export function washBar(x: number, width: number, top: number, bottom: number, seed: number): string {
  const rand = seeded(seed)
  const j = () => (rand() - 0.5) * 1.6
  const h = Math.max(0, bottom - top)
  const r = Math.min(width / 2, h / 2, 3)
  return [
    `M${(x + j()).toFixed(1)},${bottom.toFixed(1)}`,
    `L${(x + j()).toFixed(1)},${(top + r + j()).toFixed(1)}`,
    `Q${(x + j()).toFixed(1)},${(top + j()).toFixed(1)} ${(x + width / 2).toFixed(1)},${(top + j()).toFixed(1)}`,
    `Q${(x + width + j()).toFixed(1)},${(top + j()).toFixed(1)} ${(x + width + j()).toFixed(1)},${(top + r + j()).toFixed(1)}`,
    `L${(x + width + j()).toFixed(1)},${bottom.toFixed(1)}`,
    'Z',
  ].join(' ')
}
