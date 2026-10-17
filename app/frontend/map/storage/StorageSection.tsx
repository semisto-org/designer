import clsx from 'clsx'
import { Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { HelpButton } from '@/components/help/HelpButton'
import { formatDate, formatDecimal, todayIso } from '@/components/plants/format'
import { Button } from '@/components/ui/Button'
import { Field, Input, Textarea } from '@/components/ui/Field'
import { api, ApiError } from '@/lib/api'
import { t } from '@/lib/i18n'
import { useEditor } from '@/map/editor/EditorContext'
import type { MapFeature } from '@/types'
import type { ClimateStatus, StorageReading, StorageReadingsData } from '@/types/storage'
import { storageAdvice } from './advice'
import { chartDomain, dayNumber, scale } from './chart'

export const appliesToFruitStore = (feature: MapFeature) => feature.properties.kind === 'fruit_store' && feature.properties.status !== 'rejected'

const STATUS_CLASS: Record<ClimateStatus, string> = {
  good: 'bg-leaf-50 ring-leaf-200',
  fair: 'bg-humus-50 ring-humus-200',
  bad: 'bg-clay-50 ring-clay-100',
  frost: 'bg-sky-50 ring-sky-200'
}
const DOT_CLASS: Record<ClimateStatus, string> = { good: 'fill-leaf-600', fair: 'fill-humus-500', bad: 'fill-clay-500', frost: 'fill-sky-600' }
const DOT_BG: Record<ClimateStatus, string> = { good: 'bg-leaf-600', fair: 'bg-humus-500', bad: 'bg-clay-500', frost: 'bg-sky-600' }

type Input = { measuredOn: string; temperatureC: string; temperatureMinC: string; temperatureMaxC: string; humidityPct: string; note: string }
const emptyInput = (): Input => ({ measuredOn: todayIso(), temperatureC: '', temperatureMinC: '', temperatureMaxC: '', humidityPct: '', note: '' })
const number = (value: string) => (value.trim() === '' ? null : value.replace(',', '.'))

/**
 * « Climat du lieu de stockage » on a fruit store: its readings on two small
 * charts against the band where apples and pears keep best, what the latest
 * one means and what to do about it, and the line to add.
 */
export default function StorageSection({ feature }: { feature: MapFeature }) {
  const editor = useEditor()
  const base = `/maps/${editor.map.id}/features/${feature.properties.id}/storage_readings`
  const [data, setData] = useState<StorageReadingsData | null>(null)
  const [adding, setAdding] = useState(false)
  const [input, setInput] = useState<Input>(emptyInput)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, string[]>>({})

  useEffect(() => {
    const controller = new AbortController()
    setData(null)
    api<StorageReadingsData>(base, { signal: controller.signal }).then(setData).catch(() => undefined)
    return () => controller.abort()
  }, [base])

  if (!data) return null
  const { summary, ranges } = data
  const latest = summary.latest
  const update = (patch: Partial<Input>) => setInput((current) => ({ ...current, ...patch }))

  async function save() {
    setSaving(true)
    try {
      setData(await api<StorageReadingsData>(base, {
        method: 'POST',
        body: {
          storage_reading: {
            measured_on: input.measuredOn, temperature_c: number(input.temperatureC), temperature_min_c: number(input.temperatureMinC),
            temperature_max_c: number(input.temperatureMaxC), humidity_pct: number(input.humidityPct), note: input.note.trim() || null
          }
        }
      }))
      setAdding(false)
      setInput(emptyInput())
      setErrors({})
      editor.notify(t('storage_readings.saved'))
    } catch (e) {
      if (e instanceof ApiError) setErrors((e.data.errors as Record<string, string[]>) ?? {})
      editor.notify(e instanceof Error ? e.message : String(e), 'error')
    } finally {
      setSaving(false)
    }
  }

  async function remove(reading: StorageReading) {
    if (!window.confirm(t('storage_readings.confirm_delete'))) return
    try {
      setData(await api<StorageReadingsData>(`${base}/${reading.id}`, { method: 'DELETE' }))
      editor.notify(t('storage_readings.deleted'))
    } catch (e) {
      editor.notify(e instanceof Error ? e.message : String(e), 'error')
    }
  }

  return (
    <section className="space-y-3 border-t border-loam-100 pt-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-loam-500">{t('storage_readings.title')}</h3>
        <HelpButton slug="suivre-ses-recoltes" />
      </div>
      {latest?.verdict.overall
        ? (
          <div className={clsx('space-y-1.5 rounded-xl p-2.5 text-loam-800 ring-1 ring-inset', STATUS_CLASS[latest.verdict.overall])}>
            <p className="text-sm text-loam-600">{t('storage_readings.latest', { date: formatDate(latest.measuredOn) })}</p>
            <p className="font-medium">{t(`storage_readings.overall.${latest.verdict.overall}`)}</p>
            {storageAdvice(latest.verdict).map((key) => <p key={key}>{t(`storage_readings.advice.${key}`)}</p>)}
          </div>
        )
        : <p className="text-loam-600">{t('storage_readings.intro')}</p>}
      {data.readings.length > 0 && (
        <div className="space-y-1">
          <p className="text-sm font-medium text-loam-700">{t('storage_readings.chart_title')}</p>
          <ClimateChart readings={data.readings} kind="temperature" band={ranges.temperatureC.good} frost={ranges.temperatureC.frost} />
          <ClimateChart readings={data.readings} kind="humidity" band={ranges.humidityPct.good} />
          <p className="text-sm text-loam-500">{t('storage_readings.chart_good')}</p>
        </div>
      )}
      <p className="text-loam-600">
        {summary.winterReadings > 0 && summary.winterLowC != null && summary.winterHighC != null
          ? t('storage_readings.winter.seen', { count: summary.winterReadings, low: formatDecimal(summary.winterLowC), high: formatDecimal(summary.winterHighC) })
          : t('storage_readings.winter.none')}
      </p>
      <p className="text-loam-600">
        {t('storage_readings.ranges', { tmin: formatDecimal(ranges.temperatureC.good[0]), tmax: formatDecimal(ranges.temperatureC.good[1]), hmin: ranges.humidityPct.good[0], hmax: ranges.humidityPct.good[1] })}
        {' '}{t('storage_readings.advice.apart')}
      </p>
      {data.otherStores > 0 && <p className="text-loam-600">{t('storage_readings.compare')}</p>}
      {data.readings.length === 0
        ? <p className="text-loam-500">{t('storage_readings.empty')}</p>
        : (
          <ul className="space-y-1.5">
            {data.readings.map((r) => (
              <li key={r.id} className="flex items-start gap-2 rounded-xl bg-loam-50 p-2">
                {r.verdict.overall && <span className={clsx('mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full', DOT_BG[r.verdict.overall])} aria-label={t(`storage_readings.statuses.${r.verdict.overall}`)} />}
                <div className="min-w-0 flex-1">
                  <p className="text-loam-800">
                    <span className="font-medium">{formatDate(r.measuredOn)}</span>
                    {r.temperatureC != null && <> · {t('storage_readings.temperature_value', { value: formatDecimal(r.temperatureC) })}</>}
                    {r.humidityPct != null && <> · {t('storage_readings.humidity_value', { value: r.humidityPct })}</>}
                  </p>
                  {r.temperatureMinC != null && r.temperatureMaxC != null && (
                    <p className="text-loam-600">{t('storage_readings.min_max_value', { min: formatDecimal(r.temperatureMinC), max: formatDecimal(r.temperatureMaxC) })}</p>
                  )}
                  {r.note && <p className="whitespace-pre-line text-loam-600">{r.note}</p>}
                  {r.author && <p className="text-loam-400">{t('storage_readings.by', { name: r.author })}</p>}
                </div>
                {editor.canEdit && (
                  <button type="button" onClick={() => remove(r)} className="rounded p-1 text-loam-400 hover:bg-loam-100" aria-label={t('storage_readings.delete')} title={t('storage_readings.delete')}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      {editor.canEdit && (adding
        ? (
          <div className="space-y-3 rounded-2xl bg-loam-50 p-3">
            <Field label={t('storage_readings.measured_on')} error={errors.measured_on}>
              <Input type="date" value={input.measuredOn} max={todayIso()} onChange={(e) => update({ measuredOn: e.target.value })} />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label={t('storage_readings.temperature_c')} error={errors.temperature_c}>
                <Input inputMode="decimal" value={input.temperatureC} onChange={(e) => update({ temperatureC: e.target.value })} />
              </Field>
              <Field label={t('storage_readings.humidity_pct')} error={errors.humidity_pct}>
                <Input inputMode="numeric" value={input.humidityPct} onChange={(e) => update({ humidityPct: e.target.value })} />
              </Field>
              <Field label={t('storage_readings.temperature_min_c')} error={errors.temperature_min_c}>
                <Input inputMode="decimal" value={input.temperatureMinC} onChange={(e) => update({ temperatureMinC: e.target.value })} />
              </Field>
              <Field label={t('storage_readings.temperature_max_c')} error={errors.temperature_max_c}>
                <Input inputMode="decimal" value={input.temperatureMaxC} onChange={(e) => update({ temperatureMaxC: e.target.value })} />
              </Field>
            </div>
            <p className="text-sm text-loam-500">{t('storage_readings.min_max_hint')}</p>
            <Field label={t('storage_readings.note')} error={errors.note ?? errors.base}>
              <Textarea rows={2} value={input.note} placeholder={t('storage_readings.note_placeholder')} onChange={(e) => update({ note: e.target.value })} />
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => { setAdding(false); setErrors({}) }}>{t('storage_readings.cancel')}</Button>
              <Button size="sm" disabled={saving} onClick={save}>{t('storage_readings.save')}</Button>
            </div>
          </div>
        )
        : <Button variant="secondary" size="sm" className="w-full" onClick={() => setAdding(true)}>{t('storage_readings.add')}</Button>)}
    </section>
  )
}

const WIDTH = 300
const HEIGHT = 120
const PAD = { left: 34, right: 8, top: 10, bottom: 8 }

/** Axis values in order of priority, without two labels closer than a line. */
function axisTicks(values: number[], y: (v: number) => number) {
  const kept: number[] = []
  for (const v of values) if (kept.every((k) => Math.abs(y(k) - y(v)) >= 16)) kept.push(v)
  return kept
}

/** Temperature or humidity, reading after reading, over the good band. */
function ClimateChart({ readings, kind, band, frost }: { readings: StorageReading[]; kind: 'temperature' | 'humidity'; band: [number, number]; frost?: number }) {
  const valueOf = (r: StorageReading) => (kind === 'temperature' ? r.temperatureC ?? r.temperatureMaxC : r.humidityPct)
  const domain = chartDomain(readings, (r) => (kind === 'temperature' ? [r.temperatureC, r.temperatureMinC, r.temperatureMaxC] : [r.humidityPct]), band)
  const x = scale(domain.x, [PAD.left, WIDTH - PAD.right])
  const y = scale(domain.y, [HEIGHT - PAD.bottom, PAD.top])
  const points = [...readings]
    .map((r) => ({ r, value: valueOf(r) }))
    .filter((p): p is { r: StorageReading; value: number } => p.value != null)
    .sort((a, b) => dayNumber(a.r.measuredOn) - dayNumber(b.r.measuredOn))
  const status = (r: StorageReading) => (kind === 'temperature' ? r.verdict.temperature?.status : r.verdict.humidity?.status) ?? 'good'
  const unit = kind === 'temperature' ? '°C' : '%'
  const label = t(kind === 'temperature' ? 'storage_readings.temperature_c' : 'storage_readings.humidity_pct')

  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full" role="img" aria-label={label}>
      <rect x={PAD.left} y={y(band[1])} width={WIDTH - PAD.left - PAD.right} height={Math.max(0, y(band[0]) - y(band[1]))} className="fill-leaf-100" />
      {frost != null && frost >= domain.y[0] && frost <= domain.y[1] && (
        <line x1={PAD.left} x2={WIDTH - PAD.right} y1={y(frost)} y2={y(frost)} className="stroke-sky-400" strokeDasharray="3 3" />
      )}
      {axisTicks([band[0], band[1], domain.y[0], domain.y[1]], y).map((v, i) => (
        <text key={i} x={PAD.left - 4} y={y(v) + 4} textAnchor="end" className="fill-loam-500" fontSize={14}>{formatDecimal(v)}</text>
      ))}
      <text x={WIDTH - PAD.right} y={PAD.top + 2} textAnchor="end" className="fill-loam-500" fontSize={14}>{unit}</text>
      {kind === 'temperature' && readings.map((r) => r.temperatureMinC != null && r.temperatureMaxC != null && (
        <line key={`mm-${r.id}`} x1={x(dayNumber(r.measuredOn))} x2={x(dayNumber(r.measuredOn))} y1={y(r.temperatureMinC)} y2={y(r.temperatureMaxC)} className="stroke-loam-300" strokeWidth={4} strokeLinecap="round" />
      ))}
      {points.length > 1 && (
        <polyline points={points.map((p) => `${x(dayNumber(p.r.measuredOn))},${y(p.value)}`).join(' ')} className="fill-none stroke-loam-500" strokeWidth={1.5} />
      )}
      {points.map((p) => (
        <circle key={p.r.id} cx={x(dayNumber(p.r.measuredOn))} cy={y(p.value)} r={3.5} className={clsx(DOT_CLASS[status(p.r)], 'stroke-white')} strokeWidth={1}>
          <title>{`${formatDate(p.r.measuredOn)} · ${formatDecimal(p.value)} ${unit}`}</title>
        </circle>
      ))}
    </svg>
  )
}
