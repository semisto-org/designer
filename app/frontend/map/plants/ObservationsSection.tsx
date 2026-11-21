import clsx from 'clsx'
import { Camera, NotebookPen, Shovel, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { confirmAction } from '@/components/ui/confirm'
import { Field, Input, Textarea } from '@/components/ui/Field'
import { formatDate, todayIso } from '@/components/plants/format'
import { api, ApiError } from '@/lib/api'
import { t } from '@/lib/i18n'
import { useEditor } from '@/map/editor/EditorContext'
import { numberProperty, ownProperties } from '@/map/plants/properties'
import type { MapFeature } from '@/types'
import { PLANT_OBSERVATION_KINDS, type PlantObservation, type PlantObservationKind } from '@/types/plants'

const SURVIVALS = ['established', 'struggling', 'dead'] as const
const SURVIVAL_TONES: Record<string, string> = {
  established: 'bg-leaf-600 text-white ring-leaf-600',
  struggling: 'bg-humus-400 text-loam-900 ring-humus-400',
  dead: 'bg-clay-500 text-white ring-clay-500',
}

/** How many entries the page shows before « Toutes les notes ». */
const RECENT = 3

/**
 * « Observations récentes », high on a plant's page: the last three entries
 * of its journal (take, flowering, pruning, damage…), never rewritten, each
 * with its date, its photo and its note, then « Noter une observation » and
 * « Toutes les notes ». A plant not yet in the ground offers to mark it
 * planted, since its journal starts that day.
 */
export default function ObservationsSection({ feature }: { feature: MapFeature }) {
  const editor = useEditor()
  const plantedOn = typeof feature.properties.planted_on === 'string' ? feature.properties.planted_on : null
  const base = `/maps/${editor.map.id}/features/${feature.properties.id}/plant_observations`
  const [observations, setObservations] = useState<PlantObservation[] | null>(null)
  const [adding, setAdding] = useState(false)
  const [all, setAll] = useState(false)

  useEffect(() => {
    setAdding(false)
    setAll(false)
    if (!plantedOn) return
    const controller = new AbortController()
    api<{ observations: PlantObservation[] }>(base, { signal: controller.signal })
      .then((r) => setObservations(r.observations))
      .catch(() => undefined)
    return () => controller.abort()
  }, [base, plantedOn])

  async function remove(observation: PlantObservation) {
    const ok = await confirmAction({ title: t('plant_observations.confirm_delete'), confirmLabel: t('common.delete'), tone: 'danger' })
    if (!ok) return
    try {
      const r = await api<{ observations: PlantObservation[] }>(`${base}/${observation.id}`, { method: 'DELETE' })
      setObservations(r.observations)
      editor.notify(t('plant_observations.deleted'))
    } catch (e) {
      editor.notify(e instanceof Error ? e.message : String(e), 'error')
    }
  }

  if (!plantedOn) return <NotPlanted feature={feature} />

  const shown = observations ? (all ? observations : observations.slice(0, RECENT)) : []
  const more = (observations?.length ?? 0) > RECENT

  return (
    <section aria-labelledby={`recent-${feature.properties.id}`} className="space-y-2 text-sm">
      <h3 id={`recent-${feature.properties.id}`} className="font-serif text-xl text-loam-900">
        {t(all ? 'plant_feature.specimen.all_title' : 'plant_feature.specimen.recent')}
      </h3>
      {observations && observations.length === 0 && !adding && (
        <p className="text-loam-600">{t('plant_feature.specimen.nothing_yet')}</p>
      )}
      {shown.length > 0 && (
        // A ruled page: one dated line per entry.
        <ol className="divide-y divide-loam-200 border-y border-loam-200">
          {shown.map((o) => <ObservationRow key={o.id} observation={o} canDelete={editor.canEdit} onDelete={() => void remove(o)} />)}
        </ol>
      )}
      {adding ? (
        <ObservationForm base={base} plantedOn={feature.properties.planted_on_precision === 'unknown' ? undefined : plantedOn}
          onSaved={(list) => { setObservations(list); setAdding(false) }} onCancel={() => setAdding(false)} />
      ) : (
        <div className="flex flex-wrap gap-2 pt-1">
          {editor.canEdit && (
            <Button size="sm" onClick={() => setAdding(true)}>
              <NotebookPen className="h-4 w-4" aria-hidden />{t('plant_feature.specimen.note')}
            </Button>
          )}
          {(more || all) && (
            <Button variant="secondary" size="sm" aria-expanded={all} onClick={() => setAll(!all)}>
              {all ? t('plant_feature.specimen.fewer') : t('plant_feature.specimen.all', { count: observations?.length ?? 0 })}
            </Button>
          )}
        </div>
      )}
    </section>
  )
}

/** One line of the journal: the date and what was seen, the note in the notebook's hand, the photo beside. */
function ObservationRow({ observation: o, canDelete, onDelete }: { observation: PlantObservation; canDelete: boolean; onDelete: () => void }) {
  const what = [
    o.kind !== 'follow_up' ? t(`plant_observations.kinds.${o.kind}`) : null,
    o.vigor != null ? `${t('plant_observations.vigor')} ${o.vigor}/5` : null,
  ].filter(Boolean).join(' · ')
  return (
    <li className="group flex gap-3 py-2">
      {o.photoUrl ? (
        <a href={o.photoUrl} target="_blank" rel="noreferrer" className="shrink-0">
          <img src={o.thumbUrl ?? o.photoUrl} alt={t('plant_feature.specimen.photo_of', { date: formatDate(o.observedOn) })} className="h-14 w-14 rounded-lg object-cover ring-1 ring-loam-200" />
        </a>
      ) : (
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-loam-50 text-loam-400 ring-1 ring-loam-200" aria-hidden>
          <NotebookPen className="h-5 w-5" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
          <time dateTime={o.observedOn} className="font-medium text-loam-900">{formatDate(o.observedOn)}</time>
          {o.survival && <span className={clsx('rounded-full px-2 ring-1 ring-inset', SURVIVAL_TONES[o.survival])}>{t(`plant_observations.survivals.${o.survival}`)}</span>}
          {what && <span className="text-loam-600">{what}</span>}
        </p>
        {o.note && <p className="mt-0.5 line-clamp-3 whitespace-pre-line font-hand text-lg leading-snug text-loam-800">{o.note}</p>}
        {o.author && <p className="mt-0.5 text-loam-500">{t('plant_observations.by', { name: o.author })}</p>}
      </div>
      {canDelete && (
        <button type="button" onClick={onDelete} className="self-start rounded p-1 text-loam-400 opacity-0 hover:bg-loam-100 focus-visible:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100" aria-label={t('plant_observations.delete')} title={t('plant_observations.delete')}>
          <Trash2 className="h-4 w-4" />
        </button>
      )}
    </li>
  )
}

/** A plant still on paper: its journal starts the day it goes in the ground. */
function NotPlanted({ feature }: { feature: MapFeature }) {
  const editor = useEditor()
  const [date, setDate] = useState(todayIso())
  const speciesId = numberProperty(feature, 'species_id')
  if (!editor.canEdit || speciesId == null) return null

  async function mark(patch: Record<string, unknown>) {
    const properties: Record<string, unknown> = { ...ownProperties(feature), ...patch }
    if (properties.planted_on_precision == null) delete properties.planted_on_precision
    try {
      await editor.updateFeature(feature.properties.id, { properties })
      editor.notify(t('plant_feature.planted'))
    } catch (e) {
      editor.notify(e instanceof Error ? e.message : String(e), 'error')
    }
  }

  return (
    <section className="space-y-2 rounded-xl bg-leaf-50 p-3 text-sm">
      <p className="text-leaf-900">{t('plant_feature.specimen.plant_invite')}</p>
      <Field label={t('plant_feature.planted_date')}>
        <Input type="date" value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <Button variant="leaf" size="sm" className="w-full" disabled={!date} onClick={() => void mark({ planted_on: date, planted_on_precision: null })}>
        <Shovel className="h-4 w-4" />{t('plant_feature.mark_planted')}
      </Button>
      <Button variant="ghost" size="sm" className="w-full" title={t('plant_feature.mark_planted_unknown_hint')}
        onClick={() => void mark({ planted_on: todayIso(), planted_on_precision: 'unknown' })}>
        {t('plant_feature.mark_planted_unknown')}
      </Button>
    </section>
  )
}

function ObservationForm({ base, plantedOn, onSaved, onCancel }: {
  base: string; plantedOn?: string; onSaved: (list: PlantObservation[]) => void; onCancel: () => void
}) {
  const editor = useEditor()
  const [observedOn, setObservedOn] = useState(todayIso())
  const [kind, setKind] = useState<PlantObservationKind>('follow_up')
  const [survival, setSurvival] = useState<string | null>('established')
  const [vigor, setVigor] = useState<number | null>(null)
  const [note, setNote] = useState('')
  const [photo, setPhoto] = useState<File | null>(null)
  const [errors, setErrors] = useState<Record<string, string[]>>({})
  const [saving, setSaving] = useState(false)

  async function submit() {
    const body = new FormData()
    body.append('plant_observation[observed_on]', observedOn)
    body.append('plant_observation[kind]', kind)
    if (survival) body.append('plant_observation[survival]', survival)
    if (vigor != null) body.append('plant_observation[vigor]', String(vigor))
    if (note.trim()) body.append('plant_observation[note]', note.trim())
    if (photo) body.append('plant_observation[photo]', photo)
    setSaving(true)
    try {
      const r = await api<{ observations: PlantObservation[] }>(base, { method: 'POST', body })
      onSaved(r.observations)
      editor.notify(t('plant_observations.saved'))
    } catch (e) {
      if (e instanceof ApiError) setErrors((e.data.errors as Record<string, string[]>) ?? {})
      editor.notify(e instanceof Error ? e.message : String(e), 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-2 rounded-lg bg-loam-50 p-2">
      <Field label={t('plant_observations.observed_on')} error={errors.observed_on}>
        <Input type="date" value={observedOn} min={plantedOn} max={todayIso()} onChange={(e) => setObservedOn(e.target.value)} />
      </Field>
      <fieldset>
        <legend className="mb-1 text-sm font-medium text-loam-700">{t('plant_observations.kind')}</legend>
        <div className="flex flex-wrap gap-1.5">
          {PLANT_OBSERVATION_KINDS.map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={kind === k}
              onClick={() => { setKind(k); setSurvival(k === 'follow_up' ? (survival ?? 'established') : null) }}
              className={clsx('rounded-full px-2.5 py-1 text-sm ring-1 ring-inset', kind === k ? 'bg-prune-600 text-white ring-prune-600' : 'bg-white text-loam-700 ring-loam-200')}
            >
              {t(`plant_observations.kinds.${k}`)}
            </button>
          ))}
        </div>
        <p className="mt-1 text-sm text-loam-500">{t(`plant_observations.kind_hints.${kind}`)}</p>
      </fieldset>
      <fieldset>
        <legend className="mb-1 text-sm font-medium text-loam-700">{t(kind === 'follow_up' ? 'plant_observations.survival' : 'plant_observations.survival_optional')}</legend>
        <div className="flex flex-wrap gap-1.5">
          {SURVIVALS.map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={survival === s}
              onClick={() => setSurvival(kind !== 'follow_up' && survival === s ? null : s)}
              className={clsx('rounded-full px-2.5 py-1 text-sm ring-1 ring-inset', survival === s ? SURVIVAL_TONES[s] : 'bg-white text-loam-700 ring-loam-200')}
            >
              {t(`plant_observations.survivals.${s}`)}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-1 text-sm font-medium text-loam-700">{t('plant_observations.vigor')}</legend>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={vigor === v}
              title={t(`plant_observations.vigors.${v}`)}
              onClick={() => setVigor(vigor === v ? null : v)}
              className={clsx('h-8 w-8 rounded-lg text-sm ring-1 ring-inset', vigor === v ? 'bg-prune-600 text-white ring-prune-600' : 'bg-white text-loam-700 ring-loam-200')}
            >
              {v}
            </button>
          ))}
        </div>
        <p className="mt-1 text-sm text-loam-500">{vigor ? t(`plant_observations.vigors.${vigor}`) : t('plant_observations.vigor_hint')}</p>
      </fieldset>
      <Field label={t('plant_observations.note')}>
        <Textarea rows={2} value={note} placeholder={t('plant_observations.note_placeholder')} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <div>
        <span className="mb-1 block text-sm font-medium text-loam-700">{t('plant_observations.photo')}</span>
        <label className="flex cursor-pointer items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm text-loam-700 ring-1 ring-inset ring-loam-200 hover:bg-loam-100">
          <Camera className="h-4 w-4 shrink-0 text-loam-400" />
          <span className="truncate">{photo ? photo.name : t('plant_observations.choose_photo')}</span>
          <input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif" className="sr-only" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
        </label>
        {errors.photo && <span className="mt-1 block text-sm text-clay-500">{errors.photo[0]}</span>}
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>{t('common.cancel')}</Button>
        <Button size="sm" onClick={submit} disabled={saving || (kind === 'follow_up' && !survival) || (kind === 'other' && !note.trim())}>{t('plant_observations.save')}</Button>
      </div>
    </div>
  )
}
