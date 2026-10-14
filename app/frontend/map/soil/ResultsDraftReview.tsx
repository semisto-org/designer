import { ArrowRight, Bot, Check, X } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { t } from '@/lib/i18n'
import { useEditor } from '@/map/editor/EditorContext'
import { formatDate, formatValue } from '@/map/soil/format'
import { soilActions, useSoil } from '@/map/soil/store'
import type { SoilSampleData } from '@/types/soil_photos'

type Row = { id: string; label: string; proposed: string; current: string | null; unit: string | null; note?: string }

/**
 * What the person's AI read in the lab reports of a point: each value is
 * kept or refused on its own, and only a kept value reaches the results.
 * A value that would replace one already entered shows both.
 */
export default function ResultsDraftReview({ sample, blocked, onSaved }: {
  sample: SoilSampleData
  /** Unsaved edits in the form: keeping now would lose them. */
  blocked: boolean
  onSaved: (saved: SoilSampleData) => void
}) {
  const editor = useEditor()
  const { fields } = useSoil()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const draft = sample.draft
  if (!draft) return null
  const units = new Map(fields.map((f) => [f.key, f.unit]))

  const rows: Row[] = [
    ...draft.results.map((r) => ({
      id: `result:${r.key}`, label: t(`soil.fields.${r.key}.name`), proposed: formatValue(r.value),
      current: r.current == null ? null : formatValue(r.current), unit: units.get(r.key) ?? null, note: r.note,
    })),
    ...draft.otherResults.map((o) => ({ id: `other:${o.name}`, label: o.name, proposed: o.value, current: o.current, unit: o.unit ?? null, note: o.note })),
    ...(draft.lab ? [{ id: 'lab', label: t('soil.sample.lab'), proposed: draft.lab, current: sample.lab, unit: null }] : []),
    ...(draft.labReference ? [{ id: 'lab_reference', label: t('soil.sample.lab_reference'), proposed: draft.labReference, current: sample.labReference, unit: null }] : []),
    ...(draft.sampledOn ? [{ id: 'sampled_on', label: t('soil.sample.sampled_on'), proposed: formatDate(draft.sampledOn), current: sample.sampledOn ? formatDate(sample.sampledOn) : null, unit: null }] : []),
  ]

  async function review(keep: string[], refuse: string[]) {
    setBusy(true)
    setError(null)
    try {
      const saved = await soilActions.reviewDraft(editor.map.id, sample.id, { keep, refuse })
      onSaved(saved)
      if (keep.length > 0) editor.notify(t('soil.sample.ai.kept', { count: keep.length }))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const disabled = busy || blocked || !editor.canEdit
  return (
    <section className="space-y-3 rounded-xl bg-prune-50 p-3" aria-labelledby={`soil-draft-${sample.id}`}>
      <div className="space-y-1">
        <h4 id={`soil-draft-${sample.id}`} className="flex items-center gap-1.5 text-sm font-semibold text-loam-800">
          <Bot className="h-4 w-4 text-prune-600" aria-hidden />{t('soil.sample.ai.review_title', { count: rows.length })}
        </h4>
        {draft.reports.length > 0 && <p className="text-sm text-loam-600">{t('soil.sample.ai.read_from', { reports: draft.reports.join(', ') })}</p>}
        {draft.rationale && <p className="whitespace-pre-line text-sm text-loam-700">{draft.rationale}</p>}
      </div>
      {editor.canEdit && <p className="text-sm text-loam-600">{blocked ? t('soil.sample.ai.save_first') : t('soil.sample.ai.review_hint')}</p>}
      <ul className="space-y-1.5">
        {rows.map((row) => (
          <li key={row.id} className="space-y-1.5 rounded-lg border border-dashed border-prune-200 bg-white p-2.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 text-sm font-medium text-loam-900">{row.label}</span>
              <span className="flex shrink-0 items-baseline gap-1.5 text-sm">
                {row.current != null && (
                  <>
                    <span className="text-loam-500 line-through" title={t('soil.sample.ai.current')}>{row.current}</span>
                    <ArrowRight className="h-3.5 w-3.5 self-center text-loam-400" aria-label={t('soil.sample.ai.replaces')} />
                  </>
                )}
                <span className="font-semibold text-prune-800">{row.proposed}</span>
                {row.unit && <span className="text-loam-500">{row.unit}</span>}
              </span>
            </div>
            {row.note && <p className="text-sm text-loam-600">{row.note}</p>}
            {editor.canEdit && (
              <div className="flex gap-2">
                <Button size="sm" variant="leaf" disabled={disabled} onClick={() => review([row.id], [])}><Check className="h-3.5 w-3.5" aria-hidden />{t('soil.plants.ai.keep')}</Button>
                <Button size="sm" variant="secondary" disabled={disabled} onClick={() => review([], [row.id])}><X className="h-3.5 w-3.5" aria-hidden />{t('soil.plants.ai.refuse')}</Button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {error && <p role="alert" className="rounded-lg bg-clay-50 p-2.5 text-sm text-clay-700">{error}</p>}
      {editor.canEdit && rows.length > 1 && (
        <div className="grid grid-cols-2 gap-2">
          <Button size="sm" disabled={disabled} onClick={() => review(rows.map((r) => r.id), [])}>{t('soil.plants.ai.keep_all')}</Button>
          <Button size="sm" variant="secondary" disabled={disabled} onClick={() => review([], rows.map((r) => r.id))}>{t('soil.sample.ai.refuse_all')}</Button>
        </div>
      )}
    </section>
  )
}
