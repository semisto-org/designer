import clsx from 'clsx'
import { Camera, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Field, Input, Textarea } from '@/components/ui/Field'
import { formatDate, todayIso } from '@/components/plants/format'
import { api, ApiError } from '@/lib/api'
import { t } from '@/lib/i18n'
import { useEditor } from '@/map/editor/EditorContext'
import type { MapFeature } from '@/types'
import type { PlantObservation } from '@/types/plants'

const SURVIVALS = ['established', 'struggling', 'dead'] as const
const SURVIVAL_TONES: Record<string, string> = {
  established: 'bg-leaf-600 text-white ring-leaf-600',
  struggling: 'bg-humus-400 text-loam-900 ring-humus-400',
  dead: 'bg-clay-500 text-white ring-clay-500',
}

/** « Planté → observé »: follow-up of a planted plant (take, vigour, note, photo). */
export default function ObservationsSection({ feature }: { feature: MapFeature }) {
  const editor = useEditor()
  const plantedOn = typeof feature.properties.planted_on === 'string' ? feature.properties.planted_on : null
  const base = `/maps/${editor.map.id}/features/${feature.properties.id}/plant_observations`
  const [observations, setObservations] = useState<PlantObservation[] | null>(null)
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    if (!plantedOn) return
    const controller = new AbortController()
    api<{ observations: PlantObservation[] }>(base, { signal: controller.signal })
      .then((r) => setObservations(r.observations))
      .catch(() => undefined)
    return () => controller.abort()
  }, [base, plantedOn])

  async function remove(observation: PlantObservation) {
    if (!window.confirm(t('plant_observations.confirm_delete'))) return
    try {
      const r = await api<{ observations: PlantObservation[] }>(`${base}/${observation.id}`, { method: 'DELETE' })
      setObservations(r.observations)
      editor.notify(t('plant_observations.deleted'))
    } catch (e) {
      editor.notify(e instanceof Error ? e.message : String(e), 'error')
    }
  }

  return (
    <section className="space-y-3 border-t border-loam-100 pt-3 text-sm">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-loam-500">{t('plant_observations.title')}</h3>
      {!plantedOn ? (
        <p className="text-xs text-loam-500">{t('plant_observations.plant_first')}</p>
      ) : (
        <>
          {observations && observations.length === 0 && <p className="text-xs text-loam-400">{t('plant_observations.empty')}</p>}
          {observations && observations.length > 0 && (
            <ul className="space-y-2">
              {observations.map((o) => (
                <li key={o.id} className="flex gap-2 rounded-lg bg-loam-50 p-2 text-xs">
                  {o.photoUrl && <a href={o.photoUrl} target="_blank" rel="noreferrer"><img src={o.photoUrl} alt="" className="h-12 w-12 rounded object-cover" /></a>}
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-1.5">
                      <span className="font-medium text-loam-800">{formatDate(o.observedOn)}</span>
                      <span className={clsx('rounded px-1.5 ring-1 ring-inset', SURVIVAL_TONES[o.survival])}>{t(`plant_observations.survivals.${o.survival}`)}</span>
                      {o.vigor != null && <span className="text-loam-600">{t('plant_observations.vigor')} {o.vigor}/5</span>}
                    </p>
                    {o.note && <p className="mt-0.5 whitespace-pre-line text-loam-600">{o.note}</p>}
                    {o.author && <p className="mt-0.5 text-loam-400">{t('plant_observations.by', { name: o.author })}</p>}
                  </div>
                  {editor.canEdit && (
                    <button type="button" onClick={() => remove(o)} className="self-start rounded p-1 text-loam-400 hover:bg-loam-100" aria-label={t('plant_observations.delete')} title={t('plant_observations.delete')}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {editor.canEdit && (adding ? (
            <ObservationForm base={base} plantedOn={plantedOn} onSaved={(list) => { setObservations(list); setAdding(false) }} onCancel={() => setAdding(false)} />
          ) : (
            <Button variant="secondary" size="sm" className="w-full" onClick={() => setAdding(true)}>{t('plant_observations.add')}</Button>
          ))}
        </>
      )}
    </section>
  )
}

function ObservationForm({ base, plantedOn, onSaved, onCancel }: {
  base: string; plantedOn: string; onSaved: (list: PlantObservation[]) => void; onCancel: () => void
}) {
  const editor = useEditor()
  const [observedOn, setObservedOn] = useState(todayIso())
  const [survival, setSurvival] = useState<string>('established')
  const [vigor, setVigor] = useState<number | null>(null)
  const [note, setNote] = useState('')
  const [photo, setPhoto] = useState<File | null>(null)
  const [errors, setErrors] = useState<Record<string, string[]>>({})
  const [saving, setSaving] = useState(false)

  async function submit() {
    const body = new FormData()
    body.append('plant_observation[observed_on]', observedOn)
    body.append('plant_observation[survival]', survival)
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
        <legend className="mb-1 text-sm font-medium text-loam-700">{t('plant_observations.survival')}</legend>
        <div className="flex flex-wrap gap-1.5">
          {SURVIVALS.map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={survival === s}
              onClick={() => setSurvival(s)}
              className={clsx('rounded-full px-2.5 py-1 text-xs ring-1 ring-inset', survival === s ? SURVIVAL_TONES[s] : 'bg-white text-loam-700 ring-loam-200')}
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
              className={clsx('h-8 w-8 rounded-lg text-xs ring-1 ring-inset', vigor === v ? 'bg-prune-600 text-white ring-prune-600' : 'bg-white text-loam-700 ring-loam-200')}
            >
              {v}
            </button>
          ))}
        </div>
        <p className="mt-1 text-xs text-loam-400">{vigor ? t(`plant_observations.vigors.${vigor}`) : t('plant_observations.vigor_hint')}</p>
      </fieldset>
      <Field label={t('plant_observations.note')}>
        <Textarea rows={2} value={note} placeholder={t('plant_observations.note_placeholder')} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <div>
        <span className="mb-1 block text-sm font-medium text-loam-700">{t('plant_observations.photo')}</span>
        <label className="flex cursor-pointer items-center gap-2 rounded-lg bg-white px-3 py-2 text-xs text-loam-700 ring-1 ring-inset ring-loam-200 hover:bg-loam-100">
          <Camera className="h-4 w-4 shrink-0 text-loam-400" />
          <span className="truncate">{photo ? photo.name : t('plant_observations.choose_photo')}</span>
          <input type="file" accept="image/*" className="sr-only" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
        </label>
        {errors.photo && <span className="mt-1 block text-xs text-clay-500">{errors.photo[0]}</span>}
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>{t('common.cancel')}</Button>
        <Button size="sm" onClick={submit} disabled={saving}>{t('plant_observations.save')}</Button>
      </div>
    </div>
  )
}
