import { useId } from 'react'
import { t } from '@/lib/i18n'
import { dayOfYear, dayOfYearOf, pencilPath, yearFraction, type ObservedClimateData } from './model'

const W = 260
const H = 80
const X0 = 10
const X1 = 250
const BAR_TOP = 26
const BAR_BOTTOM = 50

const shortDate = new Intl.DateTimeFormat('fr-BE', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const short = (doy: number) => shortDate.format(Date.UTC(2001, 0, doy))

/**
 * The year as a ribbon, January to December: frost washes at both ends
 * (dense up to the mean date, light up to the date of one year in five),
 * the frost-free season in between, and today's date pencilled on it.
 */
export function FrostWindow({ frost, now = new Date() }: { frost: ObservedClimateData['frost']; now?: Date }) {
  const id = useId().replace(/:/g, '')
  const x = (doy: number) => X0 + yearFraction(doy) * (X1 - X0)
  const springMean = dayOfYear(frost.lastSpring.mean)
  const springLate = dayOfYear(frost.lastSpring.late) ?? springMean
  const autumnMean = dayOfYear(frost.firstAutumn.mean)
  const autumnEarly = dayOfYear(frost.firstAutumn.early) ?? autumnMean
  const today = dayOfYearOf(now)
  const labels = [springMean, autumnMean].filter((d): d is number => d != null).map(x)
  const todayLabelFits = labels.every((lx) => Math.abs(lx - x(today)) > 52)

  const wash = (from: number, to: number, className: string, opacity: number, key: string) =>
    to > from ? <rect key={key} x={x(from)} y={BAR_TOP} width={x(to) - x(from)} height={BAR_BOTTOM - BAR_TOP} className={className} opacity={opacity} /> : null

  const description = t('observed_climate.frost.ribbon_label', {
    late: springLate ? short(springLate) : '—',
    early: autumnEarly ? short(autumnEarly) : '—',
  })

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label={description}>
      <defs>
        <filter id={`frost-wash-${id}`} x="-5%" y="-30%" width="110%" height="160%">
          <feTurbulence type="fractalNoise" baseFrequency="0.09" numOctaves="3" seed="2" />
          <feDisplacementMap in="SourceGraphic" scale="3.5" />
        </filter>
        <pattern id={`frost-hatch-${id}`} width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="4" className="stroke-prune-400" strokeWidth="1.2" />
        </pattern>
      </defs>

      <g filter={`url(#frost-wash-${id})`}>
        {wash(springMean ?? 1, autumnMean ?? 366, 'fill-leaf-300', 0.55, 'season')}
        {springMean != null && wash(1, springMean, 'fill-prune-300', 0.9, 'spring')}
        {autumnMean != null && wash(autumnMean, 366, 'fill-prune-300', 0.9, 'autumn')}
      </g>
      {springMean != null && springLate != null && springLate > springMean && (
        <rect x={x(springMean)} y={BAR_TOP} width={x(springLate) - x(springMean)} height={BAR_BOTTOM - BAR_TOP} fill={`url(#frost-hatch-${id})`} opacity="0.8" />
      )}
      {autumnMean != null && autumnEarly != null && autumnMean > autumnEarly && (
        <rect x={x(autumnEarly)} y={BAR_TOP} width={x(autumnMean) - x(autumnEarly)} height={BAR_BOTTOM - BAR_TOP} fill={`url(#frost-hatch-${id})`} opacity="0.8" />
      )}

      {/* The frost-free season, written on the wash */}
      {frost.frostFreeDays != null && (
        <text x={x(((springMean ?? 1) + (autumnMean ?? 366)) / 2)} y={BAR_BOTTOM - 5} textAnchor="middle" fontSize="11" className="fill-leaf-800 font-serif">
          {`≈ ${frost.frostFreeDays} j ${t('observed_climate.frost.frost_free')}`}
        </text>
      )}

      {/* Mean dates above, one year in five below */}
      {springMean != null && <DateMark x={x(springMean)} label={short(springMean)} above />}
      {autumnMean != null && <DateMark x={x(autumnMean)} label={short(autumnMean)} above />}
      {springLate != null && springLate !== springMean && <DateMark x={x(springLate)} label={short(springLate)} />}
      {autumnEarly != null && autumnEarly !== autumnMean && <DateMark x={x(autumnEarly)} label={short(autumnEarly)} />}
      {(springLate !== springMean || autumnEarly !== autumnMean) && (
        <text x={W / 2} y={H - 2} textAnchor="middle" fontSize="9" className="fill-loam-500">{`(${t('observed_climate.frost.one_in_five')})`}</text>
      )}

      {/* Today, pencilled */}
      <path d={pencilPath([[x(today), BAR_TOP - 4], [x(today) + 0.3, BAR_BOTTOM + 4]], 0.6, today)} className="stroke-prune-800" strokeWidth="1.3" strokeLinecap="round" fill="none" />
      <circle cx={x(today)} cy={BAR_TOP - 5} r="1.8" className="fill-prune-800">
        <title>{t('observed_climate.frost.today')}</title>
      </circle>
      {todayLabelFits && (
        <text x={x(today)} y={BAR_TOP - 10} textAnchor="middle" fontSize="10" className="fill-prune-800 font-serif">{t('observed_climate.frost.today')}</text>
      )}
    </svg>
  )
}

function DateMark({ x, label, above = false }: { x: number; label: string; above?: boolean }) {
  return above ? (
    <g>
      <line x1={x} x2={x} y1={BAR_TOP - 3} y2={BAR_BOTTOM} className="stroke-prune-700" strokeWidth="1" />
      <text x={x} y={BAR_TOP - 7} textAnchor="middle" fontSize="10.5" className="fill-prune-800 font-medium">{label}</text>
    </g>
  ) : (
    <g>
      <line x1={x} x2={x} y1={BAR_TOP} y2={BAR_BOTTOM + 3} className="stroke-prune-500" strokeWidth="0.8" strokeDasharray="1.5 1.5" />
      <text x={x} y={BAR_BOTTOM + 13} textAnchor="middle" fontSize="9.5" className="fill-prune-600">{label}</text>
    </g>
  )
}
