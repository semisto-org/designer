import clsx from 'clsx'
import { Gauge, RotateCcw, Timer, Undo2 } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { pencilPath } from '@/components/observed_climate/model'
import { HelpButton } from '@/components/help/HelpButton'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Field'
import { formatNumber, t } from '@/lib/i18n'
import { storedProperties } from '@/map/drawing/catalog'
import { saveFeature } from '@/map/drawing/save'
import { useEditor } from '@/map/editor/EditorContext'
import type { MapFeature } from '@/types'
import { classOf, measure, nextReadingMinutes, type InfiltrationMethod, type Reading } from './infiltration'

export const appliesToInfiltration = (feature: MapFeature) => feature.properties.kind === 'infiltration_test'

type HistoryEntry = { on: string; rate_mm_h: number }

const WATER = '#3d7ea6'
const dateFormat = new Intl.DateTimeFormat('fr-BE', { day: 'numeric', month: 'long', year: 'numeric' })
const timeFormat = new Intl.DateTimeFormat('fr-BE', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
const round1 = (n: number) => formatNumber(Math.round(n * 10) / 10)

function parseDepth(value: string): number | null {
  const n = Number(value.replace(',', '.'))
  return Number.isFinite(n) && n >= 0 && n <= 200 ? n : null
}

/** Seconds since the start, ticking every second while the test runs. */
function useElapsed(startedAt: string | null): number | null {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!startedAt) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [startedAt])
  if (!startedAt) return null
  const start = Date.parse(startedAt)
  return Number.isFinite(start) ? Math.max(0, (now - start) / 1000) : null
}

/**
 * Inspector section of an infiltration test: the protocol step by step,
 * a timer that says when to read the water, the rate as soon as two
 * intervals exist, and what that rate means for the design.
 */
export default function InfiltrationSection({ feature }: { feature: MapFeature }) {
  const editor = useEditor()
  const p = feature.properties
  const method: InfiltrationMethod = p.method === 'ring' ? 'ring' : 'hole'
  const readings: Reading[] = Array.isArray(p.readings) ? (p.readings as Reading[]) : []
  const startedAt = typeof p.started_at === 'string' ? p.started_at : null
  const history: HistoryEntry[] = Array.isArray(p.history) ? (p.history as HistoryEntry[]) : []
  const result = measure(method, Number(p.hole_diameter_cm) || null, readings)
  // The server's figure once saved; the local one while the save travels.
  const rate = typeof p.rate_mm_h === 'number' ? p.rate_mm_h : result.rateMmH
  const stable = typeof p.rate_stable === 'boolean' ? p.rate_stable : result.stable
  const elapsed = useElapsed(startedAt)
  const lastRate = result.intervals[result.intervals.length - 1]?.rateMmH ?? null
  const last = readings[readings.length - 1] as Reading | undefined
  const dueAt = last ? last.t_s + nextReadingMinutes(lastRate) * 60 : null
  const due = elapsed != null && dueAt != null && elapsed >= dueAt
  const vibrated = useRef<number | null>(null)

  useEffect(() => {
    if (!due || dueAt == null || vibrated.current === dueAt || (result.stable && result.rateMmH != null)) return
    vibrated.current = dueAt
    navigator.vibrate?.([200, 100, 200])
  }, [due, dueAt, result.stable, result.rateMmH])

  function save(patch: Record<string, unknown>) {
    const next = { ...storedProperties(feature), ...patch }
    for (const [key, value] of Object.entries(next)) if (value == null) delete next[key]
    return saveFeature(editor, p.id, { properties: next })
  }

  function start(depth: number) {
    return save({ started_at: new Date().toISOString(), readings: [{ t_s: 0, depth_cm: depth }] })
  }

  function note(depth: number, minutes: number) {
    const t_s = Math.round(minutes * 60)
    if (last && t_s <= last.t_s) return editor.notify(t('infiltration.errors.readings'), 'error')
    return save({ readings: [...readings, { t_s, depth_cm: depth }] })
  }

  function restart() {
    if (!window.confirm(t('infiltration.restart_confirm'))) return
    const kept = rate != null && startedAt ? [...history, { on: startedAt, rate_mm_h: rate }].slice(-20) : history
    return save({ readings: null, started_at: null, rate_mm_h: null, rate_stable: null, history: kept.length ? kept : null })
  }

  const rateClass = classOf(rate)

  return (
    <section className="space-y-3 border-t border-loam-100 pt-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-loam-800">
          <Gauge className="h-4 w-4" style={{ color: WATER }} />
          {t('infiltration.title')}
        </h3>
        <HelpButton compact slug="lire-le-relief-et-l-eau" />
      </div>

      {!startedAt && (
        <>
          <p className="text-sm text-loam-700">{t('infiltration.intro')}</p>
          <ol className="space-y-2 text-sm text-loam-800">
            {[t(`infiltration.steps.dig.${method}`), t('infiltration.steps.soak'), t('infiltration.steps.start')].map((text, i) => (
              <li key={i} className="flex gap-2.5">
                <span className="mt-px grid h-5 w-5 shrink-0 place-items-center rounded-full border border-loam-400 font-serif text-sm text-loam-700">{i + 1}</span>
                <span>{text}</span>
              </li>
            ))}
          </ol>
          {editor.canEdit && <DepthForm action={t('infiltration.start')} onSubmit={(depth) => start(depth)} />}
        </>
      )}

      {startedAt && (
        <>
          <p className="text-sm text-loam-500">{t('infiltration.started', { date: timeFormat.format(new Date(startedAt)) })}</p>
          {readings.length > 1 && <LevelChart readings={readings} />}
          <ul className="space-y-0.5 text-sm tabular-nums text-loam-700">
            {readings.map((reading, i) => {
              const interval = result.intervals.find((it) => it.toS === reading.t_s)
              const refilled = i > 0 && reading.depth_cm > readings[i - 1].depth_cm
              return (
                <li key={reading.t_s} className="flex justify-between gap-2">
                  <span>{t('infiltration.reading', { minutes: formatNumber(Math.round(reading.t_s / 60)), depth: round1(reading.depth_cm) })}</span>
                  <span className="text-loam-500">
                    {interval ? t('infiltration.rate', { rate: round1(interval.rateMmH) }) : refilled ? t('infiltration.refilled') : ''}
                  </span>
                </li>
              )
            })}
          </ul>

          {rate != null && rateClass && (
            <div className="rounded-2xl bg-[#3d7ea6]/10 p-3 text-sm text-loam-800">
              <p className="font-serif text-2xl text-loam-900">{t('infiltration.rate', { rate: round1(rate) })}</p>
              <p className="font-medium">{t(`infiltration.classes.${rateClass}`)}</p>
              <p className="mt-1 text-loam-700">{t('infiltration.per_hour', { cm: round1(rate / 10) })}</p>
              <p className={clsx('mt-1', stable ? 'text-leaf-700' : 'text-humus-700')}>{t(stable ? 'infiltration.stable' : 'infiltration.unstable')}</p>
            </div>
          )}
          {rate == null && <p className="text-sm text-loam-600">{t('infiltration.waiting')}</p>}

          {editor.canEdit && (
            <div className="space-y-2">
              {rate != null && stable && <p className="text-sm text-leaf-700">{t('infiltration.done')}</p>}
              {elapsed != null && dueAt != null && !(rate != null && stable) && (
                <p className={clsx('flex items-center gap-1.5 text-sm', due ? 'font-semibold text-prune-700' : 'text-loam-600')} aria-live="polite">
                  <Timer className={clsx('h-4 w-4', due && 'animate-pulse')} />
                  {due ? t('infiltration.next_now') : t('infiltration.next_in', { minutes: formatNumber(Math.max(1, Math.ceil((dueAt - elapsed) / 60))) })}
                </p>
              )}
              <DepthForm
                action={t('infiltration.note')}
                minutes={elapsed != null ? Math.max(1, Math.round(elapsed / 60)) : undefined}
                onSubmit={(depth, minutes) => note(depth, minutes ?? 0)}
              />
              <p className="text-sm text-loam-500">{t('infiltration.refill_tip')}</p>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {readings.length > 1 && (
                  <button type="button" onClick={() => save({ readings: readings.slice(0, -1) })} className="inline-flex items-center gap-1 text-sm text-prune-700 underline-offset-2 hover:underline">
                    <Undo2 className="h-4 w-4" />
                    {t('infiltration.undo')}
                  </button>
                )}
                <button type="button" onClick={restart} className="inline-flex items-center gap-1 text-sm text-prune-700 underline-offset-2 hover:underline">
                  <RotateCcw className="h-4 w-4" />
                  {t('infiltration.restart')}
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {rateClass && <p className="text-sm text-loam-700">{t(`infiltration.advice.${rateClass}`)}</p>}
      {rate != null && <p className="text-sm text-loam-500">{t('infiltration.feeds')}</p>}

      {history.length > 0 && (
        <div className="text-sm text-loam-600">
          <p className="font-medium text-loam-700">{t('infiltration.history')}</p>
          <ul>
            {history.map((entry) => (
              <li key={entry.on} className="tabular-nums">{t('infiltration.history_entry', { date: dateFormat.format(new Date(entry.on)), rate: round1(entry.rate_mm_h) })}</li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-sm text-loam-500">{t('infiltration.time')}</p>
    </section>
  )
}

/** Height of water (cm), and the minutes since the start once the test runs. */
function DepthForm({ action, minutes, onSubmit }: { action: string; minutes?: number; onSubmit: (depth: number, minutes?: number) => unknown }) {
  const [depth, setDepth] = useState('')
  const [ownMinutes, setOwnMinutes] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const id = useId()
  const value = parseDepth(depth)
  const shownMinutes = ownMinutes ?? (minutes != null ? String(minutes) : '')
  const parsedMinutes = Number(shownMinutes.replace(',', '.'))

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (value == null || busy) return
    if (minutes != null && !(parsedMinutes > 0)) return
    setBusy(true)
    await onSubmit(value, minutes != null ? parsedMinutes : undefined)
    setBusy(false)
    setDepth('')
    setOwnMinutes(null)
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
      <label className="w-28 text-sm text-loam-600" htmlFor={`${id}-depth`}>
        {t('infiltration.depth')}
        <div className="relative mt-0.5">
          <Input id={`${id}-depth`} type="number" inputMode="decimal" min={0} max={200} step="any" value={depth} onChange={(e) => setDepth(e.target.value)} className="pr-9" />
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-loam-400">cm</span>
        </div>
      </label>
      {minutes != null && (
        <label className="w-32 text-sm text-loam-600" htmlFor={`${id}-minutes`}>
          {t('infiltration.minutes')}
          <Input id={`${id}-minutes`} type="number" inputMode="numeric" min={1} step="any" value={shownMinutes} onChange={(e) => setOwnMinutes(e.target.value)} className="mt-0.5" />
        </label>
      )}
      <Button type="submit" size="sm" disabled={value == null || busy}>{action}</Button>
    </form>
  )
}

/** The water going down in the hole, drawn in pencil on the notebook. */
function LevelChart({ readings }: { readings: Reading[] }) {
  const id = useId().replace(/:/g, '')
  const W = 260
  const H = 90
  const maxT = Math.max(60, readings[readings.length - 1].t_s)
  const maxD = Math.max(5, ...readings.map((r) => r.depth_cm))
  const x = (s: number) => 8 + (s / maxT) * (W - 16)
  const y = (cm: number) => 10 + (1 - cm / maxD) * (H - 24)
  const points = readings.map((r) => [x(r.t_s), y(r.depth_cm)] as [number, number])
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label={t('infiltration.chart_label')}>
      <defs>
        <filter id={`pencil-${id}`} x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="5" />
          <feDisplacementMap in="SourceGraphic" scale="2" />
        </filter>
      </defs>
      <path d={`${pencilPath(points, 0.6, 3)} L ${points[points.length - 1][0]} ${H - 14} L ${points[0][0]} ${H - 14} Z`} fill={WATER} opacity="0.15" />
      <path d={pencilPath(points, 0.6, 3)} fill="none" stroke={WATER} strokeWidth="1.8" strokeLinecap="round" filter={`url(#pencil-${id})`} />
      {points.map(([px, py], i) => <circle key={i} cx={px} cy={py} r="2" fill={WATER} />)}
      <path d={pencilPath([[4, H - 14], [W / 2, H - 13.5], [W - 4, H - 14.2]], 0.5, 8)} fill="none" className="stroke-loam-500" strokeWidth="0.9" />
      <text x={8} y={H - 2} fontSize="10" className="fill-loam-500">0</text>
      <text x={W - 8} y={H - 2} fontSize="10" textAnchor="end" className="fill-loam-500">{`${formatNumber(Math.round(maxT / 60))} min`}</text>
    </svg>
  )
}
