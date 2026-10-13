// A compass rose that turns with the 3D camera: the north needle always points
// to the real north of the place, and its letters stay upright. A click turns
// the view to face north.
import { useEffect, useRef } from 'react'
import { t } from '@/lib/i18n'
import { eighthOf, letterPosition } from './heading.ts'

const CARDINALS = [
  { key: 'n', bearing: 0 },
  { key: 'e', bearing: 90 },
  { key: 's', bearing: 180 },
  { key: 'w', bearing: 270 },
] as const

const LETTER_RADIUS = 31

export function Compass({ heading, onFaceNorth, className }: {
  /** Camera heading in radians clockwise from north, or null while the scene loads. */
  heading: () => number | null
  onFaceNorth: () => void
  className?: string
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
      const facing = t(`relief.page.compass.facing.${eighthOf(degrees)}`)
      button.current?.setAttribute('aria-label', t('relief.page.compass.label', { facing }))
    }
    tick()
    return () => cancelAnimationFrame(frame)
  }, [heading])

  return (
    <button
      ref={button}
      type="button"
      onClick={onFaceNorth}
      title={t('relief.page.compass.title')}
      aria-label={t('relief.page.compass.title')}
      className={className}
    >
      <svg viewBox="0 0 100 100" className="h-full w-full drop-shadow" aria-hidden="true">
        <circle cx="50" cy="50" r="47" className="fill-white/90 stroke-loam-300" strokeWidth="1.5" />
        <g ref={rose}>
          <circle cx="50" cy="50" r="19" className="fill-none stroke-loam-200" strokeWidth="1" strokeDasharray="2 3" />
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
            {t(`relief.page.compass.${key}`)}
          </text>
        ))}
      </svg>
    </button>
  )
}
