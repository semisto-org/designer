import clsx from 'clsx'
import { Car } from 'lucide-react'
import { useId, useMemo, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/Button'
import { ChipButton } from '@/components/ui/ChipButton'
import { Field, Input, Select, Textarea } from '@/components/ui/Field'
import { Segmented } from '@/components/ui/Segmented'
import { toast } from '@/components/ui/toast'
import { api, ApiError } from '@/lib/api'
import { formatNumber, t } from '@/lib/i18n'
import { durationInput, formatDuration, formatHours, parseDuration } from './format'
import type { Catalog, Phase, ProjectChoice, Reason, TimeEntry } from './types'

type Props = {
  /** The projects to choose from; one only on a project's own page. */
  projects: ProjectChoice[]
  catalog: Catalog
  billToSuggestions: string[]
  today: string
  /** Editing this entry (else a new one). */
  entry?: TimeEntry
  /** Hours already beyond each phase's envelope, on a project's page. */
  overHours?: Partial<Record<Phase, number | null>>
  onDone: (entry: TimeEntry) => void
  onCancel?: () => void
  /** Put the cursor in the duration field at once (a form that opens on demand). */
  autoFocus?: boolean
}

/**
 * « Noter du temps »: one line of work, with the trip that went with it.
 * Everything is filled in ahead (the project's likely phase, who pays,
 * the person's usual trip there): usually only the duration needs typing.
 */
export function EntryForm({ projects, catalog, billToSuggestions, today, entry, overHours, onDone, onCancel, autoFocus = false }: Props) {
  const id = useId()
  const first = projects.find((p) => p.id === entry?.mapId) ?? projects[0]
  const [mapId, setMapId] = useState(first?.id)
  const project = projects.find((p) => p.id === mapId) ?? first
  const [workedOn, setWorkedOn] = useState(entry?.workedOn ?? today)
  const [duration, setDuration] = useState(entry ? durationInput(entry.minutes) : '')
  const [phase, setPhase] = useState<Phase>(entry?.phase ?? project?.defaultPhase ?? 'commercial')
  const [billable, setBillable] = useState(entry?.billable ?? true)
  const [reason, setReason] = useState<Reason | null>(entry?.nonBillableReason ?? null)
  const [note, setNote] = useState(entry?.note ?? '')
  const [billTo, setBillTo] = useState(entry?.billTo ?? project?.billTo ?? '')
  const [trip, setTrip] = useState(entry ? entry.tripKm != null : false)
  const [km, setKm] = useState(entry?.tripKm != null ? String(entry.tripKm).replace('.', ',') : project?.usualTrip ? String(project.usualTrip.km).replace('.', ',') : '')
  const [from, setFrom] = useState(entry?.tripFrom ?? project?.usualTrip?.from ?? '')
  const [to, setTo] = useState(entry?.tripTo ?? project?.usualTrip?.to ?? '')
  const [errors, setErrors] = useState<Record<string, string[]>>({})
  const [saving, setSaving] = useState(false)

  const minutes = parseDuration(duration, catalog.stepMinutes)
  const over = overHours?.[phase]

  function pickProject(next: number) {
    setMapId(next)
    const chosen = projects.find((p) => p.id === next)
    if (!chosen || entry) return
    setPhase(chosen.defaultPhase)
    setBillTo(chosen.billTo ?? '')
    setKm(chosen.usualTrip ? String(chosen.usualTrip.km).replace('.', ',') : '')
    setFrom(chosen.usualTrip?.from ?? '')
    setTo(chosen.usualTrip?.to ?? '')
  }

  const suggestions = useMemo(() => [...new Set(billToSuggestions)], [billToSuggestions])

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!project) return
    if (!minutes) {
      setErrors({ minutes: [t('time_entries.form.duration_hint')] })
      return
    }
    setSaving(true)
    const body = {
      time_entry: {
        map_id: project.id, worked_on: workedOn, minutes, phase, billable,
        non_billable_reason: billable ? null : reason ?? 'other', note, bill_to: billTo,
        trip_km: trip && km ? Number(km.replace(',', '.')) : null,
        trip_from: trip ? from : null, trip_to: trip ? to : null,
      },
    }
    try {
      const result = entry
        ? await api<{ entry: TimeEntry }>(`/time_entries/${entry.id}`, { method: 'PATCH', body })
        : await api<{ entry: TimeEntry }>('/time_entries', { method: 'POST', body })
      setErrors({})
      toast(entry ? t('time_entries.form.updated') : t('time_entries.form.saved', { duration: formatDuration(minutes), project: project.name }), { tone: 'success' })
      if (!entry) {
        setDuration('')
        setNote('')
      }
      onDone(result.entry)
    } catch (e) {
      if (e instanceof ApiError && e.data.errors) setErrors(e.data.errors as Record<string, string[]>)
      toast(e instanceof ApiError ? e.message : t('time_entries.errors.generic'), { tone: 'error' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4" aria-label={t(entry ? 'time_entries.form.edit_title' : 'time_entries.form.title')}>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
        {projects.length > 1 ? (
          <Field label={t('time_entries.form.project')} error={errors.map}>
            <Select value={mapId} onChange={(e) => pickProject(Number(e.target.value))}>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.teamName ? `${p.name} · ${p.teamName}` : p.name}</option>)}
            </Select>
          </Field>
        ) : (
          <Field label={t('time_entries.form.phase')} error={errors.phase}>
            <PhaseSelect value={phase} onChange={setPhase} phases={catalog.phases} />
          </Field>
        )}
        <Field label={t('time_entries.form.date')} error={errors.worked_on}>
          <Input type="date" value={workedOn} max={today} onChange={(e) => setWorkedOn(e.target.value)} required />
        </Field>
        <Field label={t('time_entries.form.duration')} error={errors.minutes} hint={minutes ? formatDuration(minutes) : t('time_entries.form.duration_hint')}>
          <Input inputMode="decimal" value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="2,5" required autoFocus={autoFocus && !entry} />
        </Field>
      </div>

      {projects.length > 1 && (
        <Field label={t('time_entries.form.phase')} error={errors.phase} hint={phase === 'commercial' ? t('time_entries.phase_hints.commercial') : undefined}>
          <PhaseSelect value={phase} onChange={setPhase} phases={catalog.phases} />
        </Field>
      )}

      <Field label={t('time_entries.form.note')} error={errors.note}>
        <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('time_entries.form.note_placeholder')} maxLength={1000} />
      </Field>

      <div className="space-y-2">
        <Segmented
          label={t('time_entries.form.billable')}
          value={billable ? 'yes' : 'no'}
          onChange={(v) => { setBillable(v === 'yes'); if (v === 'no') setReason((r) => r ?? 'offered') }}
          options={[{ value: 'yes', label: t('time_entries.form.billable'), tone: 'leaf' }, { value: 'no', label: t('time_entries.form.not_billable'), tone: 'humus' }]}
        />
        {!billable && (
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t('time_entries.form.reason')}>
            <span className="text-sm text-loam-600">{t('time_entries.form.reason')}</span>
            {catalog.reasons.map((r) => (
              <ChipButton key={r} tone={reason === r ? 'humus' : 'neutral'} pressed={reason === r} onClick={() => setReason(r)}>{t(`time_entries.reasons.${r}`)}</ChipButton>
            ))}
            <span className="basis-full text-sm text-loam-500">{t(`time_entries.reason_hints.${reason ?? 'other'}`)}</span>
          </div>
        )}
        {billable && over != null && over > 0 && (
          <p className="font-hand text-lg leading-snug text-humus-700">{t('time_entries.form.over_envelope', { hours: formatHours(over) })}</p>
        )}
      </div>

      <div className="rounded-xl bg-loam-50 p-3 ring-1 ring-loam-900/10">
        <label className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium text-loam-800">
          <input type="checkbox" checked={trip} onChange={(e) => setTrip(e.target.checked)} className="h-4 w-4 rounded border-loam-300 text-prune-600 focus:ring-prune-600" />
          <Car className="h-4 w-4 text-loam-500" aria-hidden />
          {t('time_entries.form.trip')}
          {!trip && project?.usualTrip && <span className="basis-full pl-6 font-normal text-loam-500 sm:basis-auto sm:pl-0">{t('time_entries.form.usual_trip', { km: formatNumber(project.usualTrip.km) })}</span>}
        </label>
        {trip && (
          <div className="mt-3 grid gap-3 sm:grid-cols-[8rem_minmax(0,1fr)_minmax(0,1fr)]">
            <Field label={t('time_entries.form.trip_km')} error={errors.trip_km}>
              <Input inputMode="decimal" value={km} onChange={(e) => setKm(e.target.value)} placeholder="64" />
            </Field>
            <Field label={t('time_entries.form.trip_from')} error={errors.trip_from}>
              <Input value={from} onChange={(e) => setFrom(e.target.value)} maxLength={120} />
            </Field>
            <Field label={t('time_entries.form.trip_to')} error={errors.trip_to}>
              <Input value={to} onChange={(e) => setTo(e.target.value)} maxLength={120} />
            </Field>
          </div>
        )}
      </div>

      <Field label={t('time_entries.form.bill_to')} error={errors.bill_to} hint={t('time_entries.form.bill_to_hint')} className={clsx(!billable && 'opacity-60')}>
        <Input value={billTo} onChange={(e) => setBillTo(e.target.value)} list={`${id}-bill-to`} maxLength={120} />
        <datalist id={`${id}-bill-to`}>{suggestions.map((s) => <option key={s} value={s} />)}</datalist>
      </Field>

      <div className="flex flex-wrap justify-end gap-2">
        {onCancel && <Button variant="ghost" onClick={onCancel}>{t('time_entries.form.cancel')}</Button>}
        <Button type="submit" disabled={saving || !project}>{t(entry ? 'time_entries.form.update' : 'time_entries.form.save')}</Button>
      </div>
    </form>
  )
}

function PhaseSelect({ value, onChange, phases }: { value: Phase; onChange: (phase: Phase) => void; phases: Phase[] }) {
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value as Phase)}>
      {phases.map((p) => <option key={p} value={p}>{t(`time_entries.phases.${p}`)}</option>)}
    </Select>
  )
}
