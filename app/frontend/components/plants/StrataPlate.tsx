import { useId } from 'react'
import { PLATE_COLORS, PLATE_INK, PLATE_VIEWBOX, STRATA_PLATES } from '@/components/plants/specimen'
import type { Strata } from '@/types/plants'

/**
 * A plant's strata as a little watercolour, as on a naturalist's plate:
 * washes in the strata's colour of the « rendu présentation », their edges
 * roughened like wet paper, and a pencil line for the stems and the soil.
 */
export function StrataPlate({ strata, className }: { strata: Strata; className?: string }) {
  const id = useId().replace(/:/g, '')
  const marks = STRATA_PLATES[strata] ?? STRATA_PLATES.shrub
  const color = PLATE_COLORS[strata] ?? PLATE_COLORS.shrub
  return (
    <svg viewBox={PLATE_VIEWBOX} className={className} aria-hidden>
      <defs>
        <filter id={`wash-${id}`} x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.06" numOctaves={2} seed={3} />
          <feDisplacementMap in="SourceGraphic" scale={5} />
          <feGaussianBlur stdDeviation={0.6} />
        </filter>
        <filter id={`pencil-${id}`}>
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves={1} seed={2} />
          <feDisplacementMap in="SourceGraphic" scale={1.2} />
        </filter>
      </defs>
      <g filter={`url(#wash-${id})`} style={{ mixBlendMode: 'multiply' }}>
        {marks.filter((m) => m.kind !== 'ink').map((m, i) => (
          <path key={i} d={m.d} fill={color} fillOpacity={m.kind === 'deep' ? 0.45 : 0.55} stroke={color} strokeOpacity={0.5} strokeWidth={0.8} />
        ))}
      </g>
      <g filter={`url(#pencil-${id})`} fill="none" stroke={PLATE_INK} strokeWidth={1.1} strokeLinecap="round">
        {marks.filter((m) => m.kind === 'ink').map((m, i) => <path key={i} d={m.d} />)}
      </g>
    </svg>
  )
}
