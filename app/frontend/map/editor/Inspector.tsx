import { Copy, CopyCheck, Trash2, X } from 'lucide-react'
import clsx from 'clsx'
import { useEffect, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/Button'
import { Field, Input, Textarea } from '@/components/ui/Field'
import { formatArea, formatLength, t } from '@/lib/i18n'
import { useEditor } from '@/map/editor/EditorContext'
import { besideGeometry, duplicateInput, placesByClick } from '@/map/editor/duplicate'
import { elementFor } from '@/map/drawing/catalog'
import { featureName } from '@/map/earthworks/model'
import { measure } from '@/map/editor/measure'
import { INSPECTOR_SECTIONS } from '@/map/panels'
import PlantHeading from '@/map/plants/PlantHeading'
import { isPlant } from '@/map/plants/properties'
import { displayGeometry } from '@/map/zones/zones'
import type { MapFeature } from '@/types'

/**
 * Details of the selected feature: name, notes, measures, extra sections.
 * `frame="page"` fills a side sheet outside the map (the « Palette végétale »
 * opens a plant with it); `lead` comes first, under the heading.
 */
export function Inspector({ feature, frame = 'map', lead }: { feature: MapFeature; frame?: 'map' | 'page'; lead?: ReactNode }) {
  const editor = useEditor()
  const p = feature.properties
  const [name, setName] = useState(p.name ?? '')
  const [notes, setNotes] = useState(p.notes ?? '')
  useEffect(() => {
    setName(p.name ?? '')
    setNotes(p.notes ?? '')
  }, [p.id, p.name, p.notes])
  // A rounded surface is measured as drawn, like the area written on the map.
  const m = measure(displayGeometry(feature))
  const applicable = INSPECTOR_SECTIONS.filter((s) => s.applies(feature)).sort((a, b) => (a.order ?? 50) - (b.order ?? 50))
  const topSections = applicable.filter((s) => s.placement === 'top')
  const sections = applicable.filter((s) => s.placement !== 'top')

  // A sector, a zone or a sketch is made by its own tool, not copied.
  const duplicable = editor.canEdit && frame === 'map' && p.status === 'active' && elementFor(p.kind)?.pickable !== false
  const [duplicating, setDuplicating] = useState(false)

  // Clémence's test (October 2026): thirty oaks already on the land should
  // not mean typing the same sheet thirty times. A tree is copied where each
  // click lands, until Échap; a line or a surface lands beside the original.
  async function duplicate() {
    setDuplicating(true)
    try {
      if (!placesByClick(feature)) {
        const copy = await editor.createFeature(duplicateInput(feature, besideGeometry(feature.geometry)))
        editor.select(copy.properties.id)
        editor.notify(t('selection.duplicate.beside'))
        return
      }
      editor.notify(t('selection.duplicate.placing', { name: featureName(feature) }))
      let count = 0
      for (;;) {
        const at = await editor.draw('point')
        if (!at) break
        await editor.createFeature(duplicateInput(feature, at))
        count += 1
      }
      if (count > 0) editor.notify(t('selection.duplicate.placed', { count }))
    } catch (e) {
      editor.notify((e as Error).message, 'error')
    } finally {
      setDuplicating(false)
    }
  }

  function save(patch: { name?: string; notes?: string }) {
    if (!editor.canEdit) return
    if ((patch.name ?? p.name ?? '') === (p.name ?? '') && (patch.notes ?? p.notes ?? '') === (p.notes ?? '')) return
    editor.updateFeature(p.id, patch).catch((e: Error) => editor.notify(e.message, 'error'))
  }

  return (
    <aside className={clsx('overflow-y-auto bg-white', frame === 'map'
      ? 'absolute inset-x-2 bottom-14 z-20 max-h-[60%] rounded-xl p-4 shadow-xl ring-1 ring-loam-200 md:inset-x-auto md:bottom-auto md:right-3 md:top-3 md:w-80 md:max-h-[calc(100%-1.5rem)]'
      : 'h-full w-full p-5')}>
      <div className="flex items-start justify-between gap-2">
        <div>
          {/* A plant is named by its number and species, not « Plantes · Plante ». */}
          {isPlant(feature) ? <PlantHeading feature={feature} /> : (
            <p className="text-xs uppercase tracking-wide text-loam-400">
              {t(`editor.layers.${p.layer}`)} · {t(`editor.kinds.${p.kind}`)}
            </p>
          )}
          {p.status === 'draft' && <p className="mt-1 text-xs text-humus-700">{t('editor.draft_hint')}</p>}
        </div>
        <button type="button" onClick={() => editor.select(null)} className="rounded p-1 text-loam-400 hover:bg-loam-100" aria-label={t('common.close')}>
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-3 space-y-3">
        {lead}
        {topSections.map((s) => <s.component key={s.id} feature={feature} />)}
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
        {/* Picking several to move them together needs the map. */}
        {editor.canEdit && frame === 'map' && (
          <Button
            variant="ghost"
            size="sm"
            title={t('selection.start_hint')}
            onClick={() => {
              editor.select(null)
              editor.setSelection([p.id])
              editor.setMultiSelect(true)
            }}
          >
            <CopyCheck className="h-4 w-4" aria-hidden />
            {t('selection.start')}
          </Button>
        )}
        {duplicable && (
          <Button variant="ghost" size="sm" title={t('selection.duplicate.hint')} disabled={duplicating} onClick={() => void duplicate()}>
            <Copy className="h-4 w-4" aria-hidden />
            {t('selection.duplicate.action')}
          </Button>
        )}
        {editor.canEdit && (
          <Button
            variant="ghost"
            size="sm"
            className="text-clay-500"
            // No « are you sure? »: the toast that follows offers « Annuler », and ⌘Z too.
            onClick={() => editor.deleteFeature(p.id).catch((e: Error) => editor.notify(e.message, 'error'))}
          >
            <Trash2 className="h-4 w-4" />
            {t('common.delete')}
          </Button>
        )}
      </div>
    </aside>
  )
}
