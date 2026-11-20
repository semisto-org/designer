// A compass rose that turns with the 3D camera: the north needle always points
// to the real north of the place, and its letters stay upright. A click turns
// the view to face north. With `wind`, the region's wind rose (ERA5-Land, the
// year) is washed under the needle and turns with it: one sees from which
// side of the relief the wind comes.
import { useEffect, useRef } from 'react'
import { t } from '@/lib/i18n'
import { WIND_CLASS_COLORS } from '@/components/wind/colors'
import { eighthOf, letterPosition } from './heading.ts'

const CARDINALS = [
  { key: 'n', bearing: 0 },
  { key: 'e', bearing: 90 },
  { key: 's', bearing: 180 },
  { key: 'w', bearing: 270 },
] as const

const LETTER_RADIUS = 31

export function Compass({ heading, onFaceNorth, className, wind }: {
  /** Camera heading in radians clockwise from north, or null while the scene loads. */
  heading: () => number | null
  onFaceNorth: () => void
  className?: string
  /** Share of hours per direction the wind comes from (16, from north). */
  wind?: { deg: number; pct: number }[] | null
}) {
  const rose = useRef<SVGGElement>(null)
  const letters = useRef<(SVGTextElement | null)[]>([])
  const button = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    let frame = 0
    let last: number | null = null
    const tick = () => {
      frame = requestAnimationFrame(tick)
      const radians = heading()
      if (radians === null) return
      const degrees = (radians * 180) / Math.PI
      if (last !== null && Math.abs(degrees - last) < 0.1) return
      last = degrees
      rose.current?.setAttribute('transform', `rotate(${-degrees} 50 50)`)
      CARDINALS.forEach(({ bearing }, i) => {
        const { x, y } = letterPosition(bearing, degrees, LETTER_RADIUS)
        letters.current[i]?.setAttribute('x', String(x))
        letters.current[i]?.setAttribute('y', String(y))
      })
      const facing = t(`relief.page.rose.facing.${eighthOf(degrees)}`)
      button.current?.setAttribute('aria-label', t('relief.page.rose.label', { facing }))
    }
    tick()
    return () => cancelAnimationFrame(frame)
  }, [heading])

  return (
    <button
      ref={button}
      type="button"
      onClick={onFaceNorth}
      title={t('relief.page.rose.title')}
      aria-label={t('relief.page.rose.title')}
      className={className}
    >
      <svg viewBox="0 0 100 100" className="h-full w-full drop-shadow" aria-hidden="true">
        <circle cx="50" cy="50" r="47" className="fill-white/90 stroke-loam-300" strokeWidth="1.5" />
        <g ref={rose}>
          <circle cx="50" cy="50" r="19" className="fill-none stroke-loam-200" strokeWidth="1" strokeDasharray="2 3" />
          {wind && <WindPetals petals={wind} />}
          {Array.from({ length: 16 }, (_, i) => (
            <line
              key={i}
              x1="50" y1={4}
              x2="50" y2={i % 4 === 0 ? 10 : 7}
              transform={`rotate(${i * 22.5} 50 50)`}
              className={i === 0 ? 'stroke-prune-600' : 'stroke-loam-400'}
              strokeWidth={i % 4 === 0 ? 2 : 1}
              strokeLinecap="round"
            />
          ))}
          {/* The needle: plum to the north, loam to the south. */}
          <path d="M50 29 L54.5 50 L45.5 50 Z" className="fill-prune-600" />
          <path d="M50 71 L54.5 50 L45.5 50 Z" className="fill-loam-300" />
          <circle cx="50" cy="50" r="3.5" className="fill-white stroke-loam-500" strokeWidth="1.5" />
        </g>
        {CARDINALS.map(({ key, bearing }, i) => (
          <text
            key={key}
            ref={(el) => { letters.current[i] = el }}
            {...letterPosition(bearing, 0, LETTER_RADIUS)}
            textAnchor="middle"
            dominantBaseline="central"
            className={key === 'n' ? 'fill-prune-700 font-sans font-bold' : 'fill-loam-700 font-sans font-semibold'}
            style={{ fontSize: key === 'n' ? 17 : 14 }}
          >
            {t(`relief.page.rose.${key}`)}
          </text>
        ))}
      </svg>
    </button>
  )
}

/** The wind rose under the needle: petals from 6 to 40 units, in the wind sectors' teal. */
function WindPetals({ petals }: { petals: { deg: number; pct: number }[] }) {
  const max = Math.max(1, ...petals.map((p) => p.pct))
  const at = (deg: number, r: number) => `${(50 + r * Math.sin((deg * Math.PI) / 180)).toFixed(2)} ${(50 - r * Math.cos((deg * Math.PI) / 180)).toFixed(2)}`
  return (
    <g opacity="0.75">
      {petals.map((p) => {
        if (p.pct <= 0) return null
        const r = 6 + Math.sqrt(p.pct / max) * 34
        return <path key={p.deg} d={`M ${at(p.deg - 9, 5)} L ${at(p.deg - 9, r)} A ${r} ${r} 0 0 1 ${at(p.deg + 9, r)} L ${at(p.deg + 9, 5)} Z`} fill={WIND_CLASS_COLORS[1]} />
      })}
    </g>
  )
}
