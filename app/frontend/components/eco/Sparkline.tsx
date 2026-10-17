import clsx from 'clsx'

/**
 * A screen's EcoIndex score over the last versions, as a small line (0 at
 * the bottom, 100 at the top), the last point marked. A single measurement
 * draws only its point.
 */
export function Sparkline({ scores, label, className }: { scores: number[]; label: string; className?: string }) {
  const width = 96
  const height = 24
  const step = scores.length > 1 ? width / (scores.length - 1) : 0
  const points = scores.map((score, i) => [scores.length > 1 ? i * step : width, height - (score / 100) * height] as const)
  const last = points[points.length - 1]
  return (
    <svg viewBox={`-3 -3 ${width + 6} ${height + 6}`} className={clsx('h-7 w-28 overflow-visible', className)} role="img" aria-label={label}>
      {points.length > 1 && (
        <polyline
          points={points.map(([x, y]) => `${x},${y}`).join(' ')}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.7}
        />
      )}
      {last && <circle cx={last[0]} cy={last[1]} r={2.5} fill="currentColor" />}
    </svg>
  )
}

/** The design system's colour for a grade: leaf for A and B, humus for C and D, clay below. */
export function gradeTone(grade: string): 'leaf' | 'humus' | 'clay' {
  if (grade === 'A' || grade === 'B') return 'leaf'
  if (grade === 'C' || grade === 'D') return 'humus'
  return 'clay'
}
