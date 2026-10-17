import { Hammer } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Field'
import { formatDate, todayIso } from '@/components/plants/format'
import { t } from '@/lib/i18n'
import { storedProperties } from '@/map/drawing/catalog'
import { saveFeature } from '@/map/drawing/save'
import { useEditor } from '@/map/editor/EditorContext'
import { isPlannedElement } from '@/map/scenario'
import type { MapFeature } from '@/types'

// What is drawn there is already on the ground by definition (existing) or
// is not a work on the land (notes); plants have their planting date.
const NOT_BUILT = new Set(['existing', 'notes'])

/** Accepted elements other than plants: ponds, hedges, paths, sheds… */
export function appliesToProjectState(feature: MapFeature): boolean {
  const p = feature.properties
  return p.status === 'active' && !NOT_BUILT.has(p.layer) && !(p.layer === 'plants' && p.kind === 'plant')
}

/**
 * Inspector section « Sur le terrain »: whether the element is already
 * there or still a project. A planned element (`planned: true`) shows only
 * in « Situation projetée »; marking it done keeps the day (`built_on`),
 * as a plant keeps its planting date.
 */
export default function ProjectStateSection({ feature }: { feature: MapFeature }) {
  const editor = useEditor()
  const [date, setDate] = useState(todayIso())
  const planned = isPlannedElement(feature.properties)
  const builtOn = typeof feature.properties.built_on === 'string' ? feature.properties.built_on : null

  async function save(patch: Record<string, unknown>) {
    const next = { ...storedProperties(feature), ...patch }
    Object.keys(next).forEach((key) => next[key] == null && delete next[key])
    return saveFeature(editor, feature.properties.id, { properties: next })
  }

  return (
    <section className="space-y-2 border-t border-loam-100 pt-3">
      <h3 className="text-sm font-semibold text-loam-600">{t('scenario.element.title')}</h3>
      {planned ? (
        <>
          <p className="text-sm text-loam-600">{t('scenario.element.planned')}</p>
          {editor.canEdit && (
            <div className="space-y-2">
              <Field label={t('scenario.element.built_date')}>
                <Input type="date" value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} />
              </Field>
              <Button variant="leaf" size="sm" className="w-full" onClick={() => void save({ planned: null, built_on: date }).then((saved) => saved && editor.notify(t('scenario.element.built')))}>
                <Hammer className="h-4 w-4" />{t('scenario.element.mark_built')}
              </Button>
            </div>
          )}
        </>
      ) : (
        <div className="flex items-center justify-between gap-2 rounded-lg bg-leaf-50 p-2 text-sm text-leaf-800">
          <span>{builtOn ? t('scenario.element.built_on', { date: formatDate(builtOn) }) : t('scenario.element.existing')}</span>
          {editor.canEdit && (
            <button type="button" className="shrink-0 text-leaf-700 underline" onClick={() => void save({ planned: true, built_on: null })}>
              {t('scenario.element.mark_planned')}
            </button>
          )}
        </div>
      )}
    </section>
  )
}
