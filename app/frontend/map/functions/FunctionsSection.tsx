import clsx from 'clsx'
import { Check, RotateCcw } from 'lucide-react'
import { t } from '@/lib/i18n'
import { storedProperties } from '@/map/drawing/catalog'
import { saveFeature } from '@/map/drawing/save'
import { useEditor } from '@/map/editor/EditorContext'
import { entryFor, useElementFunctions } from '@/map/functions/store'
import type { MapFeature } from '@/types'

/**
 * « Fonctions » of the selected element: what it does in the design
 * (proposed from its kind or its species, adjustable), what it asks of the
 * place and what it gives back, and the functions it is alone to serve.
 */
export default function FunctionsSection({ feature }: { feature: MapFeature }) {
  const editor = useEditor()
  const { data } = useElementFunctions()
  const entry = entryFor(data, feature.properties.id)
  if (!data || !entry) return null

  const stored = feature.properties.functions
  const own = Array.isArray(stored) ? (stored as string[]) : null
  const selected = own ?? entry.functions
  const alone = data.balance.filter((b) => b.status === 'fragile' && b.entries.includes(entry.key) && selected.includes(b.function))
  if (!editor.canEdit && selected.length === 0) return null

  function save(next: string[] | null) {
    const properties = storedProperties(feature)
    if (next == null) delete properties.functions
    else properties.functions = data!.functions.filter((f) => next.includes(f))
    void saveFeature(editor, feature.properties.id, { properties })
  }

  const toggle = (fn: string) => save(selected.includes(fn) ? selected.filter((f) => f !== fn) : [...selected, fn])
  const shown = editor.canEdit ? data.functions : selected
  const resources = (list: string[]) => list.map((r) => t(`element_functions.resources.${r}`)).join(', ')

  return (
    <section>
      <h3 className="mb-1 text-sm font-medium text-loam-700">{t('element_functions.section.title')}</h3>
      <div className="flex flex-wrap gap-1.5">
        {shown.map((fn) => {
          const on = selected.includes(fn)
          return (
            <button
              key={fn} type="button" disabled={!editor.canEdit} aria-pressed={on} onClick={() => toggle(fn)}
              className={clsx(
                'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-sm transition-colors',
                on ? 'bg-leaf-100 font-medium text-leaf-800' : 'text-loam-500 ring-1 ring-loam-200 hover:bg-loam-50',
                !editor.canEdit && 'cursor-default',
              )}
            >
              {on && <Check className="h-3.5 w-3.5" aria-hidden />}
              {t(`element_functions.names.${fn}`)}
            </button>
          )
        })}
      </div>
      {editor.canEdit && (
        <p className="mt-1.5 flex flex-wrap items-center gap-x-2 text-sm text-loam-500">
          {own ? t('element_functions.section.own') : t(`element_functions.section.proposed_${entry.origin === 'species' ? 'species' : 'kind'}`)}
          {own && (
            <button type="button" onClick={() => save(null)} className="inline-flex items-center gap-1 font-medium text-prune-700 hover:underline">
              <RotateCcw className="h-3.5 w-3.5" aria-hidden />
              {t('element_functions.section.reset')}
            </button>
          )}
        </p>
      )}
      {alone.length > 0 && (
        <p className="mt-1.5 text-sm text-humus-700">
          {t('element_functions.section.alone', { functions: alone.map((b) => t(`element_functions.names.${b.function}`).toLowerCase()).join(', ') })}
        </p>
      )}
      {(entry.needs.length > 0 || entry.yields.length > 0) && (
        <dl className="mt-2 space-y-0.5 text-sm">
          {entry.needs.length > 0 && (
            <div className="flex gap-2"><dt className="text-loam-500">{t('element_functions.section.needs')}</dt><dd className="text-loam-800">{resources(entry.needs)}</dd></div>
          )}
          {entry.yields.length > 0 && (
            <div className="flex gap-2"><dt className="text-loam-500">{t('element_functions.section.yields')}</dt><dd className="text-loam-800">{resources(entry.yields)}</dd></div>
          )}
        </dl>
      )}
    </section>
  )
}
