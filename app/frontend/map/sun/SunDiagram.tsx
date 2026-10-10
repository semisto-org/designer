import { useId } from 'react'
import { t } from '@/lib/i18n'
import { horizonAt, splitPath } from '@/map/sun/geometry'
import type { HorizonPoint, SunPath, SunPathKey } from '@/map/sun/types'

// Drawing frame, in viewBox units.
const W = 320
const H = 210
const LEFT = 26
const RIGHT = 8
const TOP = 16
const BOTTOM = 30
const PLOT_W = W - LEFT - RIGHT
const PLOT_H = H - TOP - BOTTOM
// Compass span drawn: from north-east to north-west, the south in the middle.
const AZ_MIN = 30
const AZ_MAX = 330

export const SEASON_COLORS: Record<SunPathKey, string> = {
  winter_solstice: 'var(--color-prune-500)',
  equinox: 'var(--color-leaf-600)',
  summer_solstice: 'var(--color-humus-500)',
}

const CARDINALS: [number, string][] = [[45, 'ne'], [90, 'e'], [135, 'se'], [180, 's'], [225, 'sw'], [270, 'w'], [315, 'nw']]
const LABELLED_HOURS = new Set([6, 9, 15, 18])

/**
 * The sky of the terrain, as a page of a field notebook: the horizon
 * silhouette in watercolour and the sun's path at the winter solstice, the
 * equinox and the summer solstice, solid where the sun shines on the
 * terrain, dashed where the relief hides it. Pencil strokes come from a
 * small displacement filter, the geometry underneath stays exact.
 */
export function SunDiagram({ paths, profile }: { paths: SunPath[]; profile: HorizonPoint[] | null }) {
  const id = useId().replace(/:/g, '')
  const summerNoon = paths.find((p) => p.key === 'summer_solstice')?.noonElevation ?? 60
  const maxElevation = Math.max(40, Math.ceil((summerNoon + 6) / 10) * 10)
  const x = (azimuth: number) => LEFT + ((azimuth - AZ_MIN) / (AZ_MAX - AZ_MIN)) * PLOT_W
  const y = (elevation: number) => TOP + (1 - elevation / maxElevation) * PLOT_H
  // A new sub-path where the azimuth wraps through north (far north, summer nights).
  const line = (points: { azimuth: number; elevation: number }[]) =>
    points.map((p, i) => {
      const jump = i === 0 || Math.abs(p.azimuth - points[i - 1].azimuth) > 180
      return `${jump ? 'M' : 'L'}${x(p.azimuth).toFixed(1)},${y(p.elevation).toFixed(1)}`
    }).join(' ')

  // Horizon silhouette sampled every 2 degrees across the drawn span.
  const silhouette: { azimuth: number; elevation: number }[] = []
  for (let az = AZ_MIN; az <= AZ_MAX; az += 2) silhouette.push({ azimuth: az, elevation: profile ? Math.max(0, horizonAt(profile, az)) : 0 })
  const hills = `${line(silhouette)} L${x(AZ_MAX)},${y(0)} L${x(AZ_MIN)},${y(0)} Z`
  const grid = Array.from({ length: maxElevation / 10 - 1 }, (_, i) => (i + 1) * 10)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('sun.diagram.aria')} className="block h-auto w-full">
      <defs>
        <filter id={`${id}-pencil`} x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="2" seed="3" />
          <feDisplacementMap in="SourceGraphic" scale="2.2" />
        </filter>
        <filter id={`${id}-wash`} x="-5%" y="-10%" width="110%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.02 0.06" numOctaves="3" seed="8" />
          <feDisplacementMap in="SourceGraphic" scale="6" />
        </filter>
        <filter id={`${id}-grain`}>
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="5" />
          <feColorMatrix values="0 0 0 0 0.35  0 0 0 0 0.3  0 0 0 0 0.22  0 0 0 0.07 0" />
        </filter>
        <clipPath id={`${id}-sky`}>
          <rect x={LEFT} y={TOP - 6} width={PLOT_W} height={PLOT_H + 6} />
        </clipPath>
      </defs>

      {/* Paper */}
      <rect x="0" y="0" width={W} height={H} rx="10" fill="var(--color-loam-50)" />
      <rect x="0" y="0" width={W} height={H} rx="10" filter={`url(#${id}-grain)`} />

      {/* Elevation grid, in pencil */}
      {grid.map((elevation) => (
        <g key={elevation}>
          <line x1={LEFT} x2={W - RIGHT} y1={y(elevation)} y2={y(elevation)} stroke="var(--color-loam-300)" strokeWidth="0.6" strokeDasharray="1 3" />
          <text x={LEFT - 4} y={y(elevation) + 3} textAnchor="end" className="fill-loam-400" fontSize="8">
            {t('sun.diagram.elevation', { degrees: elevation })}
          </text>
        </g>
      ))}

      {/* Horizon: two watercolour washes and a pencil line */}
      <g clipPath={`url(#${id}-sky)`}>
        <path d={hills} fill="var(--color-leaf-200)" opacity="0.55" filter={`url(#${id}-wash)`} />
        <path d={hills} fill="var(--color-lichen-300)" opacity="0.35" transform="translate(0 2)" filter={`url(#${id}-wash)`} />
        <path d={line(silhouette)} fill="none" stroke="var(--color-loam-700)" strokeWidth="1.1" strokeLinecap="round" filter={`url(#${id}-pencil)`} />

        {/* Sun paths */}
        {paths.map((path) => {
          const color = SEASON_COLORS[path.key]
          return (
            <g key={path.key}>
              {splitPath(path.points, profile).map((run, index) => (
                <path
                  key={index}
                  d={line(run.points)}
                  fill="none"
                  stroke={color}
                  strokeWidth={run.visible ? 2 : 1.2}
                  strokeDasharray={run.visible ? undefined : '2 3'}
                  opacity={run.visible ? 0.95 : 0.5}
                  strokeLinecap="round"
                  filter={run.visible ? `url(#${id}-pencil)` : undefined}
                />
              ))}
              {path.points.filter((p) => p.minutes % 60 === 0 && p.elevation > 0).map((p) => {
                const hidden = profile ? p.elevation <= horizonAt(profile, p.azimuth) : false
                const hour = p.minutes / 60
                return (
                  <g key={p.minutes}>
                    <circle cx={x(p.azimuth)} cy={y(p.elevation)} r="1.8" fill={hidden ? 'var(--color-loam-50)' : color} stroke={color} strokeWidth="0.8" />
                    {path.key === 'summer_solstice' && LABELLED_HOURS.has(hour) && (
                      <text x={x(p.azimuth)} y={y(p.elevation) - 5} textAnchor="middle" fontSize="8" className="fill-loam-500">{hour} h</text>
                    )}
                  </g>
                )
              })}
            </g>
          )
        })}
      </g>

      {/* Season names, handwritten above each noon */}
      {paths.map((path) => (
        <text
          key={path.key}
          x={x(180)}
          y={y(path.noonElevation) - 6}
          textAnchor="middle"
          fontSize="13"
          style={{ fontFamily: 'var(--font-hand)', fill: SEASON_COLORS[path.key] }}
        >
          {t(`sun.seasons.${path.key}`)}
        </text>
      ))}

      {/* Ground line and compass */}
      <line x1={LEFT} x2={W - RIGHT} y1={y(0)} y2={y(0)} stroke="var(--color-loam-600)" strokeWidth="0.8" filter={`url(#${id}-pencil)`} />
      {CARDINALS.map(([azimuth, key]) => (
        <g key={key}>
          <line x1={x(azimuth)} x2={x(azimuth)} y1={y(0)} y2={y(0) + 3} stroke="var(--color-loam-500)" strokeWidth="0.8" />
          <text x={x(azimuth)} y={y(0) + 14} textAnchor="middle" fontSize={key === 's' ? 11 : 9} fontWeight={key === 's' ? 600 : 400} className="fill-loam-600">
            {t(`sun.diagram.cardinals.${key}`)}
          </text>
        </g>
      ))}
    </svg>
  )
}
