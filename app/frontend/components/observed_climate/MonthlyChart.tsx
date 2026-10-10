import { useId } from 'react'
import { formatMm, formatTemp } from '@/components/climate/format'
import { t } from '@/lib/i18n'
import { pencilPath, washBar, type ObservedMonth } from './model'

const W = 260
const H = 140
const LEFT = 8
const RIGHT = 244
const BOTTOM = 120
const TOP = 12
const SLOT = (RIGHT - LEFT) / 12
// Pond water of the home page time-lapse: the design system has no blue token.
const WATER = '#7fa7c2'

const monthName = new Intl.DateTimeFormat('fr-BE', { month: 'long', timeZone: 'UTC' })

/**
 * Rain (watercolour bars) and temperature (pencil line over the wash of
 * the daily minimum and maximum), month by month, like a page of a field
 * notebook. Values on hover through <title>.
 */
export function MonthlyChart({ months }: { months: ObservedMonth[] }) {
  const id = useId().replace(/:/g, '')
  const maxRain = Math.max(100, ...months.map((m) => m.rainMm))
  const temps = months.flatMap((m) => [m.meanMinC, m.meanMaxC, m.meanTempC]).filter((v): v is number => v != null)
  const tMin = Math.min(0, Math.floor(Math.min(...temps) / 5) * 5)
  const tMax = Math.max(25, Math.ceil(Math.max(...temps) / 5) * 5)
  const yTemp = (c: number) => BOTTOM - ((c - tMin) / (tMax - tMin)) * (BOTTOM - TOP)
  const yRain = (mm: number) => BOTTOM - (mm / maxRain) * (BOTTOM - TOP) * 0.62
  const cx = (i: number) => LEFT + SLOT * (i + 0.5)
  const line = (key: 'meanTempC' | 'meanMinC' | 'meanMaxC') =>
    months.map((m, i) => (m[key] == null ? null : [cx(i), yTemp(m[key] as number)] as [number, number])).filter((p): p is [number, number] => p !== null)
  const lows = line('meanMinC')
  const highs = line('meanMaxC')
  const band = lows.length === 12 && highs.length === 12
    ? `${pencilPath(highs, 0, 1)} L${lows[11][0]},${lows[11][1]} ${pencilPath([...lows].reverse(), 0, 1).replace(/^M/, 'L')} Z`
    : null
  const initials = t('observed_climate.months.initials')

  return (
    <figure className="space-y-1.5">
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label={t('observed_climate.months.chart_label')}>
        <defs>
          <filter id={`pencil-${id}`} x="-5%" y="-5%" width="110%" height="110%">
            <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="4" />
            <feDisplacementMap in="SourceGraphic" scale="2.2" />
          </filter>
          <filter id={`wash-${id}`} x="-10%" y="-10%" width="120%" height="120%">
            <feTurbulence type="fractalNoise" baseFrequency="0.08" numOctaves="3" seed="9" />
            <feDisplacementMap in="SourceGraphic" scale="3" />
          </filter>
        </defs>

        {/* 0 °C, when winters go below it */}
        {tMin < 0 && (
          <g className="text-prune-500">
            <line x1={LEFT} x2={RIGHT} y1={yTemp(0)} y2={yTemp(0)} stroke="currentColor" strokeWidth="0.8" strokeDasharray="2 3" filter={`url(#pencil-${id})`} />
            <text x={RIGHT + 2} y={yTemp(0) + 3} fontSize="9" fill="currentColor">0°</text>
          </g>
        )}

        {/* Rain: two layers of wash, the second a bit narrower and darker at the bottom */}
        <g filter={`url(#wash-${id})`}>
          {months.map((m, i) => (
            <g key={m.month}>
              <path d={washBar(cx(i) - SLOT * 0.34, SLOT * 0.68, yRain(m.rainMm), BOTTOM, i + 1)} fill={WATER} opacity="0.5" />
              <path d={washBar(cx(i) - SLOT * 0.24, SLOT * 0.48, yRain(m.rainMm * 0.55), BOTTOM, i + 31)} fill={WATER} opacity="0.35" />
            </g>
          ))}
        </g>

        {/* Temperature: the daily range as a warm wash, the mean as a pencil line */}
        {band && <path d={band} className="fill-humus-300" opacity="0.32" filter={`url(#wash-${id})`} />}
        <path d={pencilPath(line('meanTempC'), 1, 3)} fill="none" className="stroke-humus-700" strokeWidth="1.6" strokeLinecap="round" filter={`url(#pencil-${id})`} />
        {line('meanTempC').map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r="1.6" className="fill-humus-700" />
        ))}

        {/* Ground line and month initials */}
        <path d={pencilPath([[LEFT - 4, BOTTOM + 0.5], [W / 2, BOTTOM + 1], [RIGHT + 4, BOTTOM + 0.3]], 0.6, 5)} fill="none" className="stroke-loam-500" strokeWidth="0.9" />
        {months.map((m, i) => (
          <text key={m.month} x={cx(i)} y={BOTTOM + 13} textAnchor="middle" fontSize="10" className="fill-loam-500">{initials[i]}</text>
        ))}

        {/* Hover targets */}
        {months.map((m, i) => (
          <rect key={m.month} x={LEFT + SLOT * i} y={TOP} width={SLOT} height={BOTTOM - TOP + 16} fill="transparent">
            <title>{`${monthName.format(Date.UTC(2001, i, 1))} : ${formatMm(m.rainMm)}, ${formatTemp(m.meanTempC)} (${formatTemp(m.meanMinC)} / ${formatTemp(m.meanMaxC)})`}</title>
          </rect>
        ))}
      </svg>
      <figcaption className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-loam-600">
        <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: WATER, opacity: 0.7 }} aria-hidden />{t('observed_climate.months.rain_legend')}</span>
        <span className="inline-flex items-center gap-1"><span className="h-0.5 w-3 rounded bg-humus-700" aria-hidden />{t('observed_climate.months.temp_legend')}</span>
        <span className="inline-flex items-center gap-1"><span className="h-2.5 w-3 rounded-sm bg-humus-300/50" aria-hidden />{t('observed_climate.months.range_legend')}</span>
      </figcaption>
    </figure>
  )
}
