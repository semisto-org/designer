import clsx from 'clsx'
import type { SketchGeometry } from '@/types/myMaps'

const WASH = 'var(--color-leaf-200)'
const PENCIL = 'var(--color-loam-600)'

function rings(geom: SketchGeometry | null): number[][][] {
  if (!geom) return []
  if (geom.type === 'Polygon') return [geom.coordinates[0] as number[][]]
  if (geom.type === 'MultiPolygon') return (geom.coordinates as number[][][][]).map((p) => p[0])
  return []
}

/** The outline in local metres (north up), fitted into a size × size box. */
export function outlinePaths(geom: SketchGeometry | null, size: number, pad = 6): string[] {
  const all = rings(geom)
  const pts = all.flat()
  if (pts.length < 3) return []
  const lat0 = pts.reduce((sum, p) => sum + p[1], 0) / pts.length
  const k = Math.cos((lat0 * Math.PI) / 180)
  const raw = (p: number[]) => [p[0] * 111_320 * k, -p[1] * 110_540]
  const xy = pts.map(raw)
  const [x0, x1] = [Math.min(...xy.map((p) => p[0])), Math.max(...xy.map((p) => p[0]))]
  const [y0, y1] = [Math.min(...xy.map((p) => p[1])), Math.max(...xy.map((p) => p[1]))]
  const scale = (size - 2 * pad) / Math.max(x1 - x0, y1 - y0, 1)
  const ox = (size - scale * (x1 - x0)) / 2
  const oy = (size - scale * (y1 - y0)) / 2
  return all.map((ring) => ring.map((p, i) => {
    const [x, y] = raw(p)
    return `${i === 0 ? 'M' : 'L'}${(ox + (x - x0) * scale).toFixed(1)},${(oy + (y - y0) * scale).toFixed(1)}`
  }).join('') + 'Z')
}

/**
 * A place's outline as a small notebook vignette: a watercolour wash and a
 * pencil line drawn twice. No outline yet: a dashed pencil ellipse.
 */
export function PlaceThumb({ boundary, size = 56, muted = false, className }: { boundary: SketchGeometry | null; size?: number; muted?: boolean; className?: string }) {
  const paths = outlinePaths(boundary, size)
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} aria-hidden="true" className={clsx('shrink-0 rounded-xl bg-loam-50 ring-1 ring-loam-200', muted && 'opacity-60 grayscale', className)}>
      {paths.length === 0 ? (
        <ellipse cx={size / 2} cy={size / 2} rx={size * 0.32} ry={size * 0.24} transform={`rotate(-12 ${size / 2} ${size / 2})`} fill="none" stroke={PENCIL} strokeOpacity={0.6} strokeDasharray="3 4" />
      ) : (
        paths.map((d, i) => (
          <g key={i}>
            <path d={d} fill={WASH} fillOpacity={0.75} transform="translate(1.2 0.8)" />
            <path d={d} fill="none" stroke={PENCIL} strokeOpacity={0.8} strokeWidth={0.9} strokeLinejoin="round" />
            <path d={d} fill="none" stroke={PENCIL} strokeOpacity={0.3} strokeWidth={0.9} strokeLinejoin="round" transform="translate(-0.7 0.6)" />
          </g>
        ))
      )}
    </svg>
  )
}
