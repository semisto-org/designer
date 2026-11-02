import { Eraser, Hammer, Undo2 } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Field'
import { formatDate, todayIso } from '@/components/plants/format'
import { t } from '@/lib/i18n'
import { storedProperties } from '@/map/drawing/catalog'
import { saveFeature } from '@/map/drawing/save'
import { useEditor } from '@/map/editor/EditorContext'
import { BUILDING_KINDS, canBePlanned, canBeRemoved, isPlannedElement, isToRemove, removedOn } from '@/map/scenario'
import type { MapFeature } from '@/types'

/** Accepted elements other than plants: ponds, hedges, paths, buildings, existing trees… */
export function appliesToProjectState(feature: MapFeature): boolean {
  const p = feature.properties
  return p.status === 'active' && (canBePlanned(p.layer, p.kind) || canBeRemoved(p.layer, p.kind))
}

/**
 * Inspector section « Sur le terrain »: whether the element is already
 * there, still a project, or there today but taken away by the project.
 * - A planned element (`planned: true`) shows only in the years to come;
 *   marking it done keeps the day (`built_on`), as a plant keeps its
 *   planting date.
 * - An element « À retirer » (`to_remove: true`: a fence to move, a shed
 *   to take down) shows today, faded and dotted, and leaves the years to
 *   come; marking it taken away keeps the day (`removed_on`): it then
 *   shows only on arrival.
 */
export default function ProjectStateSection({ feature }: { feature: MapFeature }) {
  const editor = useEditor()
  const [date, setDate] = useState(todayIso())
  const p = feature.properties
  const planned = isPlannedElement(p)
  const toRemove = isToRemove(p)
  const removed = removedOn(p)
  const builtOn = typeof p.built_on === 'string' ? p.built_on : null

  async function save(patch: Record<string, unknown>, notice?: string) {
    const next = { ...storedProperties(feature), ...patch }
    Object.keys(next).forEach((key) => next[key] == null && delete next[key])
    const saved = await saveFeature(editor, p.id, { properties: next })
    if (saved && notice) editor.notify(notice)
    return saved
  }

  const dateField = (label: string) => (
    <Field label={label}>
      <Input type="date" value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} />
    </Field>
  )

  return (
    <section className="space-y-2 border-t border-loam-100 pt-3">
      <h3 className="text-sm font-semibold text-loam-600">{t('scenario.element.title')}</h3>
      {planned ? (
        <>
          <p className="text-sm text-loam-600">{t('scenario.element.planned')}</p>
          {BUILDING_KINDS.has(p.kind) && <p className="text-sm text-loam-600">{t('scenario.element.planned_building')}</p>}
          {editor.canEdit && (
            <div className="space-y-2">
              {dateField(t('scenario.element.built_date'))}
              <Button variant="leaf" size="sm" className="w-full" onClick={() => void save({ planned: null, built_on: date }, t('scenario.element.built'))}>
                <Hammer className="h-4 w-4" />{t('scenario.element.mark_built')}
              </Button>
            </div>
          )}
        </>
      ) : removed ? (
        <div className="space-y-2">
          <p className="text-sm text-loam-600">{t('scenario.removal.removed_on', { date: formatDate(removed) })}</p>
          {editor.canEdit && (
            <Button variant="ghost" size="sm" onClick={() => void save({ removed_on: null })}>
              <Undo2 className="h-4 w-4" />{t('scenario.removal.undo_removed')}
            </Button>
          )}
        </div>
      ) : toRemove ? (
        <>
          <p className="rounded-lg bg-clay-50 p-2 text-sm text-clay-700">{t('scenario.removal.to_remove')}</p>
          {editor.canEdit && (
            <div className="space-y-2">
              {dateField(t('scenario.removal.removed_date'))}
              <Button variant="secondary" size="sm" className="w-full" onClick={() => void save({ to_remove: null, removed_on: date }, t('scenario.removal.removed'))}>
                <Eraser className="h-4 w-4" />{t('scenario.removal.mark_removed')}
              </Button>
              <Button variant="ghost" size="sm" className="w-full" onClick={() => void save({ to_remove: null })}>
                {t('scenario.removal.keep')}
              </Button>
            </div>
          )}
        </>
      ) : (
        <div className="space-y-1 rounded-lg bg-leaf-50 p-2 text-sm text-leaf-800">
          <p>{builtOn ? t('scenario.element.built_on', { date: formatDate(builtOn) }) : t('scenario.element.existing')}</p>
          {editor.canEdit && (
            <div className="flex flex-wrap gap-1">
              {canBePlanned(p.layer, p.kind) && (
                <Button variant="ghost" size="sm" onClick={() => void save({ planned: true, built_on: null })}>
                  <Hammer className="h-4 w-4" />{t('scenario.element.mark_planned')}
                </Button>
              )}
              {canBeRemoved(p.layer, p.kind) && (
                <Button variant="ghost" size="sm" title={t('scenario.removal.mark_hint')} onClick={() => void save({ to_remove: true }, t('scenario.removal.marked'))}>
                  <Eraser className="h-4 w-4" />{t('scenario.removal.mark')}
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  )
}
