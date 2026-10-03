import { useEffect, useMemo, useRef, useState } from 'react'
import { formatMoney, formatMoneyCompact } from '@/components/finances/format'
import { t } from '@/lib/i18n'
import type { FinanceYear } from '@/types/climate_finance'

const HEIGHT = 240
const M = { top: 18, right: 18, bottom: 28, left: 58 }
const LINE = 'var(--color-prune-600)'

/** Round tick values covering [min, max] (about four steps). */
function niceTicks(min: number, max: number): number[] {
  if (min === max) return [min - 1, min, min + 1]
  const raw = (max - min) / 4
  const power = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * power).find((s) => s >= raw) ?? raw
  const ticks: number[] = []
  for (let v = Math.floor(min / step) * step; v <= Math.ceil(max / step) * step + step / 2; v += step) ticks.push(Number(v.toFixed(6)))
  return ticks
}

/**
 * Cumulative cash over the plan's 20 years: one line with a light wash to
 * the zero baseline, the low point and the end value labelled, and a
 * crosshair tooltip (pointer and arrow keys). The yearly table below the
 * chart carries every value.
 */
export function CashChart({ years }: { years: FinanceYear[] }) {
  const box = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(640)
  const [active, setActive] = useState<number | null>(null)

  useEffect(() => {
    const element = box.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(280, Math.round(entry.contentRect.width))))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const geometry = useMemo(() => {
    const values = years.map((y) => y.cumulativeCash)
    const ticks = niceTicks(Math.min(0, ...values), Math.max(0, ...values))
    const [lo, hi] = [ticks[0], ticks[ticks.length - 1]]
    const innerW = width - M.left - M.right
    const innerH = HEIGHT - M.top - M.bottom
    const x = (i: number) => M.left + (years.length > 1 ? (i * innerW) / (years.length - 1) : innerW / 2)
    const y = (v: number) => M.top + innerH - ((v - lo) / (hi - lo || 1)) * innerH
    const points = values.map((v, i) => [x(i), y(v)] as const)
    const line = points.map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(1)},${py.toFixed(1)}`).join('')
    const area = `${line}L${x(values.length - 1).toFixed(1)},${y(0).toFixed(1)}L${x(0).toFixed(1)},${y(0).toFixed(1)}Z`
    const lowest = values.reduce((best, v, i) => (v < values[best] ? i : best), 0)
    return { ticks, x, y, points, line, area, lowest, values }
  }, [years, width])

  if (years.length === 0) return null
  const { ticks, x, y, points, line, area, lowest, values } = geometry
  const last = values.length - 1
  const every = width >= 640 ? 1 : 5
  const xTicks = years.map((_, i) => i).filter((i) => i === 0 || (i + 1) % every === 0)
  const activeYear = active != null ? years[active] : null

  function pick(clientX: number) {
    const rect = box.current?.getBoundingClientRect()
    if (!rect) return
    const innerW = width - M.left - M.right
    const i = Math.round(((clientX - rect.left - M.left) / innerW) * (years.length - 1))
    setActive(Math.min(years.length - 1, Math.max(0, i)))
  }

  return (
    <div
      ref={box}
      className="relative w-full select-none overflow-hidden rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-prune-500"
      tabIndex={0}
      role="group"
      aria-label={t('finances.chart.aria')}
      onPointerMove={(e) => pick(e.clientX)}
      onPointerLeave={() => setActive(null)}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') setActive((a) => Math.min(years.length - 1, (a ?? -1) + 1))
        else if (e.key === 'ArrowLeft') setActive((a) => Math.max(0, (a ?? years.length) - 1))
        else if (e.key === 'Escape') setActive(null)
        else return
        e.preventDefault()
      }}
      onBlur={() => setActive(null)}
    >
      <svg width={width} height={HEIGHT} className="block font-sans" aria-hidden>
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={M.left} x2={width - M.right} y1={y(tick)} y2={y(tick)} stroke={tick === 0 ? 'var(--color-loam-400)' : 'var(--color-loam-200)'} strokeWidth={1} />
            <text x={M.left - 8} y={y(tick)} dy="0.32em" textAnchor="end" className="fill-loam-500 text-[11px] tabular-nums">{formatMoneyCompact(tick)}</text>
          </g>
        ))}
        {xTicks.map((i) => (
          <text key={i} x={x(i)} y={HEIGHT - 8} textAnchor="middle" className="fill-loam-500 text-[11px] tabular-nums">{years[i].calendarYear}</text>
        ))}
        <path d={area} fill={LINE} fillOpacity={0.1} />
        <path d={line} fill="none" stroke={LINE} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {values[lowest] < 0 && lowest !== last && (
          <g>
            <circle cx={points[lowest][0]} cy={points[lowest][1]} r={4} fill={LINE} stroke="white" strokeWidth={2} />
            <text x={points[lowest][0]} y={points[lowest][1] + 18} textAnchor="middle" className="fill-loam-700 text-[11px] font-medium">
              {t('finances.chart.lowest')} {formatMoneyCompact(values[lowest])}
            </text>
          </g>
        )}
        <circle cx={points[last][0]} cy={points[last][1]} r={4} fill={LINE} stroke="white" strokeWidth={2} />
        <text x={points[last][0] - 6} y={points[last][1] + (values[last] >= 0 ? -10 : 18)} textAnchor="end" className="fill-loam-900 text-[12px] font-semibold tabular-nums">
          {formatMoneyCompact(values[last])}
        </text>
        {active != null && (
          <g>
            <line x1={x(active)} x2={x(active)} y1={M.top} y2={HEIGHT - M.bottom} stroke="var(--color-loam-400)" strokeWidth={1} />
            <circle cx={points[active][0]} cy={points[active][1]} r={5} fill={LINE} stroke="white" strokeWidth={2} />
          </g>
        )}
      </svg>
      {activeYear && active != null && (
        <div
          className="pointer-events-none absolute top-1 z-10 w-44 rounded-lg bg-white p-2.5 text-xs shadow-lg ring-1 ring-loam-200"
          style={{ left: Math.min(Math.max(x(active) - 88, 0), width - 176) }}
          role="status"
        >
          <p className="text-loam-500">{t('finances.kpis.year', { year: activeYear.year, calendar: activeYear.calendarYear })}</p>
          <p className="mt-1 flex items-center gap-1.5">
            <span className="h-0.5 w-3 rounded" style={{ background: LINE }} aria-hidden />
            <strong className="text-sm tabular-nums text-loam-900">{formatMoney(activeYear.cumulativeCash)}</strong>
          </p>
          <p className="text-loam-500">{t('finances.chart.tooltip_cumulative')}</p>
          <p className="mt-1 tabular-nums text-loam-800">{formatMoney(activeYear.netCashFlow)}</p>
          <p className="text-loam-500">{t('finances.chart.tooltip_net')}</p>
        </div>
      )}
    </div>
  )
}
