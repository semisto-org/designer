import { useId } from 'react'
import { t } from '@/lib/i18n'
import { COLD_SPRING_COLOR, SIGN_COLOR, STRONG_COLOR, WIND_CLASS_COLORS } from './colors'
import type { WindView } from './model'

type Petal = { deg: number; pct: number; classes: number[] | null }

/**
 * A wind rose in the field notebook's hand: 16 petals, one per direction the
 * wind comes FROM, their length the share of hours (square root, so that a
 * small share still shows), washed in watercolour by speed class. The
 * geometry stays exact under a light displacement filter. Arrows in the
 * notebook's brown are what the person measured on the land.
 */
export function WindRose({ petals, view, prevailing, signs = [], size = 220, tone = 'paper', className }: {
  petals: Petal[]
  view: WindView
  prevailing: number | null
  /** Directions the wind came from, measured by the person on the land. */
  signs?: number[]
  size?: number
  tone?: 'paper' | 'dark'
  className?: string
}) {
  const id = useId().replace(/:/g, '')
  const c = 100
  const inner = 9
  const outer = 78
  const max = Math.max(1, ...petals.map((p) => p.pct))
  const radius = (pct: number) => inner + Math.sqrt(pct / max) * (outer - inner)
  const at = (deg: number, r: number) => [c + r * Math.sin((deg * Math.PI) / 180), c - r * Math.cos((deg * Math.PI) / 180)] as const
  const wedge = (deg: number, r0: number, r1: number) => {
    const half = 9.5
    const [ax, ay] = at(deg - half, r0)
    const [bx, by] = at(deg - half, r1)
    const [cx, cy] = at(deg + half, r1)
    const [dx, dy] = at(deg + half, r0)
    return `M ${ax.toFixed(2)} ${ay.toFixed(2)} L ${bx.toFixed(2)} ${by.toFixed(2)} A ${r1} ${r1} 0 0 1 ${cx.toFixed(2)} ${cy.toFixed(2)} L ${dx.toFixed(2)} ${dy.toFixed(2)} A ${r0} ${r0} 0 0 0 ${ax.toFixed(2)} ${ay.toFixed(2)} Z`
  }
  const single = view === 'cold_spring' ? COLD_SPRING_COLOR : view === 'strong' ? STRONG_COLOR : null
  const ink = tone === 'dark' ? 'rgba(255,255,255,0.75)' : 'var(--color-loam-500)'
  const faint = tone === 'dark' ? 'rgba(255,255,255,0.25)' : 'var(--color-loam-200)'
  const letters = [['n', 0], ['e', 90], ['s', 180], ['w', 270]] as const

  return (
    <svg viewBox="0 0 200 200" width={size} height={size} className={className} role="img" aria-label={t('wind.rose.label')}>
      <defs>
        <filter id={`${id}-wash`} x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="11" />
          <feDisplacementMap in="SourceGraphic" scale="3.5" />
        </filter>
        <filter id={`${id}-pencil`} x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="2" seed="4" />
          <feDisplacementMap in="SourceGraphic" scale="1.6" />
        </filter>
      </defs>
      {[0.33, 0.66, 1].map((k) => (
        <circle key={k} cx={c} cy={c} r={inner + k * (outer - inner)} fill="none" stroke={faint} strokeWidth="0.8" strokeDasharray="2 3" />
      ))}
      <g filter={`url(#${id}-wash)`} opacity="0.92">
        {petals.map((petal) => {
          if (petal.pct <= 0) return null
          if (single || !petal.classes) {
            return <path key={petal.deg} d={wedge(petal.deg, inner, radius(petal.pct))} fill={single ?? WIND_CLASS_COLORS[1]} opacity="0.85" />
          }
          // Stacked from the centre out: breeze, then stronger winds.
          let from = 0
          return petal.classes.map((share, i) => {
            if (share <= 0) return null
            const r0 = radius(from)
            from += share
            return <path key={`${petal.deg}-${i}`} d={wedge(petal.deg, from - share > 0 ? r0 : inner, radius(from))} fill={WIND_CLASS_COLORS[Math.min(i, WIND_CLASS_COLORS.length - 1)]} opacity="0.9" />
          })
        })}
      </g>
      {prevailing != null && (() => {
        const [x, y] = at(prevailing, outer + 6)
        return <circle cx={x} cy={y} r="3.2" fill={single ?? WIND_CLASS_COLORS[3]} filter={`url(#${id}-pencil)`} />
      })()}
      {/* What the person measured on the land: an arrow blowing towards the centre. */}
      {signs.map((deg, i) => {
        const [x0, y0] = at(deg, outer + 14)
        const [x1, y1] = at(deg, outer - 16)
        return (
          <g key={`${deg}-${i}`} stroke={SIGN_COLOR} strokeWidth="1.6" strokeLinecap="round" fill="none" filter={`url(#${id}-pencil)`}>
            <line x1={x0} y1={y0} x2={x1} y2={y1} />
            <path d={`M ${at(deg - 6, outer - 8).join(' ')} L ${x1} ${y1} L ${at(deg + 6, outer - 8).join(' ')}`} />
          </g>
        )
      })}
      <circle cx={c} cy={c} r={inner - 2} fill="none" stroke={ink} strokeWidth="0.8" />
      {letters.map(([key, deg]) => {
        const [x, y] = at(deg, 94)
        return (
          <text key={key} x={x} y={y} textAnchor="middle" dominantBaseline="central" fill={key === 'n' ? (tone === 'dark' ? 'white' : 'var(--color-prune-700)') : ink}
            style={{ fontSize: 11, fontWeight: key === 'n' ? 700 : 600 }}>
            {t(`wind.rose.points.${key}`)}
          </text>
        )
      })}
    </svg>
  )
}
