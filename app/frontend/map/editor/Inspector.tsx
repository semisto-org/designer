import { Trash2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Field, Input, Textarea } from '@/components/ui/Field'
import { formatArea, formatLength, t } from '@/lib/i18n'
import { useEditor } from '@/map/editor/EditorContext'
import { measure } from '@/map/editor/measure'
import { INSPECTOR_SECTIONS } from '@/map/panels'
import type { MapFeature } from '@/types'

/** Details of the selected feature: name, notes, measures, extra sections. */
export function Inspector({ feature }: { feature: MapFeature }) {
  const editor = useEditor()
  const p = feature.properties
  const [name, setName] = useState(p.name ?? '')
  const [notes, setNotes] = useState(p.notes ?? '')
  useEffect(() => {
    setName(p.name ?? '')
    setNotes(p.notes ?? '')
  }, [p.id, p.name, p.notes])
  const m = measure(feature.geometry)
  const sections = INSPECTOR_SECTIONS.filter((s) => s.applies(feature)).sort((a, b) => (a.order ?? 50) - (b.order ?? 50))

  function save(patch: { name?: string; notes?: string }) {
    if (!editor.canEdit) return
    if ((patch.name ?? p.name ?? '') === (p.name ?? '') && (patch.notes ?? p.notes ?? '') === (p.notes ?? '')) return
    editor.updateFeature(p.id, patch).catch((e: Error) => editor.notify(e.message, 'error'))
  }

  return (
    <aside className="absolute inset-x-2 bottom-14 z-20 max-h-[60%] overflow-y-auto rounded-xl bg-white p-4 shadow-xl ring-1 ring-loam-200 md:inset-x-auto md:bottom-auto md:right-3 md:top-3 md:w-80 md:max-h-[calc(100%-1.5rem)]">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-wide text-loam-400">
            {t(`editor.layers.${p.layer}`)} · {t(`editor.kinds.${p.kind}`)}
          </p>
          {p.status === 'draft' && <p className="mt-1 text-xs text-humus-700">{t('editor.draft_hint')}</p>}
        </div>
        <button type="button" onClick={() => editor.select(null)} className="rounded p-1 text-loam-400 hover:bg-loam-100" aria-label={t('common.close')}>
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-3 space-y-3">
        <Field label={t('editor.inspector.name')}>
          <Input value={name} disabled={!editor.canEdit} onChange={(e) => setName(e.target.value)} onBlur={() => save({ name })} />
        </Field>
        <Field label={t('editor.inspector.notes')}>
          <Textarea rows={3} value={notes} disabled={!editor.canEdit} onChange={(e) => setNotes(e.target.value)} onBlur={() => save({ notes })} />
        </Field>
        <dl className="grid grid-cols-2 gap-2 text-sm">
          {m.area != null && <div><dt className="text-xs text-loam-500">{t('editor.measure.area')}</dt><dd>{formatArea(m.area)}</dd></div>}
          {m.length != null && <div><dt className="text-xs text-loam-500">{t(m.area != null ? 'editor.measure.perimeter' : 'editor.measure.length')}</dt><dd>{formatLength(m.length)}</dd></div>}
        </dl>
        {p.rationale && (
          <div className="rounded-lg bg-prune-50 p-3 text-sm text-prune-800">
            <p className="text-xs font-semibold uppercase tracking-wide">{t('editor.inspector.rationale')}</p>
            <p className="mt-1 whitespace-pre-line">{p.rationale}</p>
          </div>
        )}
        {sections.map((s) => <s.component key={s.id} feature={feature} />)}
        {editor.canEdit && (
          <Button
            variant="ghost"
            size="sm"
            className="text-clay-500"
            onClick={() => {
              if (window.confirm(t('editor.inspector.confirm_delete'))) {
                editor.deleteFeature(p.id).catch((e: Error) => editor.notify(e.message, 'error'))
              }
            }}
          >
            <Trash2 className="h-4 w-4" />
            {t('common.delete')}
          </Button>
        )}
      </div>
    </aside>
  )
}
