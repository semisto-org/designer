import { Loader2, MapPin, Plus, Trash2, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input, Select, Textarea } from '@/components/ui/Field'
import { t } from '@/lib/i18n'
import { useEditor } from '@/map/editor/EditorContext'
import { visibleOffset } from '@/map/visiblePadding'
import { RESULT_GROUPS, today } from '@/map/soil/format'
import ResultsDraftReview from '@/map/soil/ResultsDraftReview'
import SampleReading from '@/map/soil/SampleReading'
import SampleReports from '@/map/soil/SampleReports'
import { soilActions, useSoil, type SamplePayload } from '@/map/soil/store'
import type { SoilOtherResult, SoilResultKey, SoilSampleData } from '@/types/soil_photos'

type Form = {
  label: string
  status: 'planned' | 'sampled'
  sampledOn: string
  depthFrom: string
  depthTo: string
  lab: string
  labReference: string
  notes: string
  results: Partial<Record<SoilResultKey, string>>
  others: { name: string; value: string; unit: string }[]
}

function toForm(sample: SoilSampleData): Form {
  const results: Form['results'] = {}
  Object.entries(sample.results).forEach(([key, value]) => { results[key as SoilResultKey] = String(value).replace('.', ',') })
  return {
    label: sample.label, status: sample.status, sampledOn: sample.sampledOn ?? '', depthFrom: String(sample.depthFromCm),
    depthTo: String(sample.depthToCm), lab: sample.lab ?? '', labReference: sample.labReference ?? '', notes: sample.notes ?? '', results,
    others: sample.otherResults.map((o) => ({ name: o.name, value: o.value, unit: o.unit ?? '' })),
  }
}

function toPayload(form: Form): SamplePayload {
  const results: SamplePayload['results'] = {}
  Object.entries(form.results).forEach(([key, value]) => { if (value && value.trim()) results[key as SoilResultKey] = value.trim() })
  return {
    label: form.label.trim(), status: form.status, sampled_on: form.sampledOn || null,
    depth_from_cm: form.depthFrom, depth_to_cm: form.depthTo, lab: form.lab.trim(), lab_reference: form.labReference.trim(),
    notes: form.notes, results,
    other_results: form.others
      .filter((o) => o.name.trim() && o.value.trim())
      .map((o): SoilOtherResult => ({ name: o.name.trim(), value: o.value.trim(), ...(o.unit.trim() ? { unit: o.unit.trim() } : {}) })),
  }
}

/** The form of one sampling point: where, when, the lab and its figures, the PDF reports (and what an AI read in them), and the reading of the figures. */
export default function SampleEditor({ sample, onClose }: { sample: SoilSampleData; onClose: () => void }) {
  const editor = useEditor()
  const { analyses, fields } = useSoil()
  const mapId = editor.map.id
  const canEdit = editor.canEdit
  const [form, setForm] = useState<Form>(() => toForm(sample))
  const [initial, setInitial] = useState<string>(() => JSON.stringify(toForm(sample)))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dirty = JSON.stringify(form) !== initial
  const specs = useMemo(() => new Map(fields.map((f) => [f.key, f])), [fields])
  const located = sample.lng != null && sample.lat != null

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((current) => ({ ...current, [key]: value }))
  const setResult = (key: SoilResultKey, value: string) => setForm((current) => ({ ...current, results: { ...current.results, [key]: value } }))
  const setOther = (index: number, patch: Partial<Form['others'][number]>) =>
    setForm((current) => ({ ...current, others: current.others.map((o, i) => (i === index ? { ...o, ...patch } : o)) }))

  /** The sample came back from the server (values kept from the AI): the form follows. */
  function reset(saved: SoilSampleData) {
    const next = toForm(saved)
    setForm(next)
    setInitial(JSON.stringify(next))
  }

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const saved = await soilActions.saveSample(mapId, sample.id, toPayload(form))
      reset(saved)
      editor.notify(t('soil.sample.saved'))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function destroy() {
    if (!window.confirm(t('soil.sample.confirm_delete'))) return
    try {
      await soilActions.deleteSample(mapId, sample.id)
      editor.notify(t('soil.sample.deleted'))
    } catch (e) {
      setError((e as Error).message)
    }
  }

  function locate() {
    if (!located) return
    editor.instance.easeTo({ center: [sample.lng as number, sample.lat as number], zoom: Math.max(editor.instance.getZoom(), 18), offset: visibleOffset(true) })
  }

  return (
    <form className="space-y-4 border-t border-loam-100 px-3 pb-3 pt-3" onSubmit={(e) => { e.preventDefault(); if (canEdit && dirty) save() }}>
      <ResultsDraftReview sample={sample} blocked={dirty} onSaved={reset} />

      <fieldset disabled={!canEdit || saving} className="space-y-3">
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <label className="block space-y-1">
            <span className="block text-xs font-medium text-loam-600">{t('soil.sample.label')}</span>
            <Input value={form.label} maxLength={80} required onChange={(e) => set('label', e.target.value)} />
          </label>
          <label className="block space-y-1">
            <span className="block text-xs font-medium text-loam-600">{t('soil.sample.status')}</span>
            <Select value={form.status} onChange={(e) => {
              const status = e.target.value as Form['status']
              setForm((current) => ({ ...current, status, sampledOn: status === 'sampled' && !current.sampledOn ? today() : current.sampledOn }))
            }}>
              <option value="planned">{t('soil.points.status.planned')}</option>
              <option value="sampled">{t('soil.points.status.sampled')}</option>
            </Select>
          </label>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="block space-y-1">
            <span className="block text-xs font-medium text-loam-600">{t('soil.sample.sampled_on')}</span>
            <Input type="date" value={form.sampledOn} onChange={(e) => set('sampledOn', e.target.value)} />
          </label>
          <div className="space-y-1">
            <span className="block text-xs font-medium text-loam-600">{t('soil.sample.depth')}</span>
            <div className="flex items-center gap-1.5">
              <Input type="number" inputMode="numeric" min={0} max={200} value={form.depthFrom} aria-label={t('soil.sample.depth_from')} onChange={(e) => set('depthFrom', e.target.value)} />
              <span className="text-xs text-loam-500" aria-hidden>{t('soil.sample.depth_to')}</span>
              <Input type="number" inputMode="numeric" min={0} max={200} value={form.depthTo} aria-label={t('soil.sample.depth_to')} onChange={(e) => set('depthTo', e.target.value)} />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="block space-y-1">
            <span className="block text-xs font-medium text-loam-600">{t('soil.sample.lab')}</span>
            <Input value={form.lab} maxLength={160} placeholder={t('soil.sample.lab_placeholder')} onChange={(e) => set('lab', e.target.value)} />
          </label>
          <label className="block space-y-1">
            <span className="block text-xs font-medium text-loam-600">{t('soil.sample.lab_reference')}</span>
            <Input value={form.labReference} maxLength={160} onChange={(e) => set('labReference', e.target.value)} />
          </label>
        </div>

        <label className="block space-y-1">
          <span className="block text-xs font-medium text-loam-600">{t('soil.sample.notes')}</span>
          <Textarea rows={2} value={form.notes} placeholder={t('soil.sample.notes_placeholder')} onChange={(e) => set('notes', e.target.value)} />
        </label>

        <div className="space-y-3 rounded-lg bg-loam-50 p-3">
          <div>
            <h4 className="text-sm font-semibold text-loam-800">{t('soil.sample.results')}</h4>
            <p className="text-xs text-loam-500">{t('soil.sample.results_hint')}</p>
          </div>
          {RESULT_GROUPS.map((group) => (
            <div key={group.id} className="space-y-2">
              <h5 className="text-xs font-semibold uppercase tracking-wide text-loam-500">{t(`soil.sample.groups.${group.id}`)}</h5>
              {group.keys.map((key) => {
                const spec = specs.get(key)
                const inputId = `soil-${sample.id}-${key}`
                return (
                  <div key={key} className="group">
                    <div className="flex items-center justify-between gap-3">
                      <label htmlFor={inputId} className="text-sm text-loam-700">{t(`soil.fields.${key}.name`)}</label>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <div className="w-20">
                          <Input
                            id={inputId} inputMode="decimal" autoComplete="off" className="text-right" value={form.results[key] ?? ''}
                            aria-describedby={`${inputId}-hint`} onChange={(e) => setResult(key, e.target.value)}
                          />
                        </div>
                        <span className="w-16 text-[11px] leading-tight text-loam-500">{spec?.unit ?? ''}</span>
                      </div>
                    </div>
                    <p id={`${inputId}-hint`} className="mt-1 hidden text-xs text-loam-500 group-focus-within:block">{t(`soil.fields.${key}.hint`)}</p>
                  </div>
                )
              })}
            </div>
          ))}
          <div className="space-y-2">
            <h5 className="text-xs font-semibold uppercase tracking-wide text-loam-500">{t('soil.sample.groups.others')}</h5>
            {form.others.length === 0 && <p className="text-sm text-loam-500">{t('soil.sample.others_hint')}</p>}
            {form.others.map((other, index) => (
              <div key={index} className="space-y-1.5 rounded-lg bg-white p-2 ring-1 ring-loam-100">
                <div className="flex items-center gap-1.5">
                  <Input value={other.name} maxLength={80} placeholder={t('soil.sample.other_name')} aria-label={t('soil.sample.other_name')} onChange={(e) => setOther(index, { name: e.target.value })} />
                  {canEdit && (
                    <button type="button" className="shrink-0 rounded p-1 text-loam-400 hover:bg-loam-50 hover:text-clay-500" aria-label={t('soil.sample.other_remove')} onClick={() => setForm((current) => ({ ...current, others: current.others.filter((_, i) => i !== index) }))}>
                      <X className="h-4 w-4" aria-hidden />
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <Input value={other.value} maxLength={40} className="text-right" placeholder={t('soil.sample.other_value')} aria-label={t('soil.sample.other_value')} onChange={(e) => setOther(index, { value: e.target.value })} />
                  <Input value={other.unit} maxLength={30} placeholder={t('soil.sample.other_unit')} aria-label={t('soil.sample.other_unit')} onChange={(e) => setOther(index, { unit: e.target.value })} />
                </div>
              </div>
            ))}
            {canEdit && (
              <Button size="sm" variant="ghost" onClick={() => setForm((current) => ({ ...current, others: [...current.others, { name: '', value: '', unit: '' }] }))}>
                <Plus className="h-4 w-4" aria-hidden />{t('soil.sample.other_add')}
              </Button>
            )}
          </div>
        </div>
      </fieldset>

      <SampleReports sample={sample} onError={setError} />

      <section className="space-y-2" aria-label={t('soil.sample.position')}>
        <h4 className="text-sm font-semibold text-loam-800">{t('soil.sample.position')}</h4>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-sm text-loam-600">
            <MapPin className="h-4 w-4" aria-hidden />
            {located ? t('soil.sample.placed') : t('soil.points.not_placed')}
          </span>
          {located && <Button size="sm" variant="ghost" onClick={locate}>{t('soil.sample.locate')}</Button>}
          {canEdit && (
            <Button size="sm" variant="secondary" onClick={() => soilActions.startPlacing({ kind: 'sample', id: sample.id })}>
              {located ? t('soil.sample.move') : t('soil.sample.place')}
            </Button>
          )}
        </div>
      </section>

      <section className="space-y-2" aria-label={t('soil.sample.reading')}>
        <h4 className="text-sm font-semibold text-loam-800">{t('soil.sample.reading')}</h4>
        {sample.interpretation ? (
          <SampleReading reading={sample.interpretation} />
        ) : Object.keys(sample.results).length === 0 ? (
          <p className="text-xs text-loam-500">{t('soil.sample.reading_empty')}</p>
        ) : !analyses ? (
          <p className="rounded-lg bg-prune-50 p-2.5 text-xs text-prune-800">{t('soil.sample.reading_locked')}</p>
        ) : (
          <p className="text-xs text-loam-500">{t('soil.sample.reading_empty')}</p>
        )}
      </section>

      {error && <p role="alert" className="rounded-lg bg-clay-50 p-2.5 text-sm text-clay-700">{error}</p>}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {canEdit && (
            <Button type="submit" size="sm" disabled={!dirty || saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              {saving ? t('soil.sample.saving') : t('soil.sample.save')}
            </Button>
          )}
          {dirty && canEdit && !saving && <span className="text-xs text-humus-700">{t('soil.sample.unsaved')}</span>}
        </div>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={onClose}>{t('soil.sample.close')}</Button>
          {canEdit && (
            <Button size="sm" variant="ghost" className="text-clay-500" onClick={destroy}>
              <Trash2 className="h-4 w-4" aria-hidden />
              <span className="sr-only">{t('soil.sample.delete')}</span>
            </Button>
          )}
        </div>
      </div>
    </form>
  )
}
