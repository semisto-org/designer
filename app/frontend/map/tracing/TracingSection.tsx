import clsx from 'clsx'
import { Check } from 'lucide-react'
import { useMemo } from 'react'
import { Button } from '@/components/ui/Button'
import { Segmented } from '@/components/ui/Segmented'
import { t } from '@/lib/i18n'
import { storedProperties } from '@/map/drawing/catalog'
import { saveFeature } from '@/map/drawing/save'
import { useEditor } from '@/map/editor/EditorContext'
import { useElementFunctions } from '@/map/functions/store'
import type { MapFeature } from '@/types'
import { insideBubble } from './inside'
import { BUBBLE_KIND, isSheet, SHEETS, type Sheet } from './sheets'

const SHOWN = 6

/**
 * Inspector section of the tracing sheets (map/tracing). A bubble: the
 * project's functions it answers, and what the frame and the planting
 * already draw inside it. A free zone or a note: the sheet it shows on.
 */
export default function TracingSection({ feature }: { feature: MapFeature }) {
  return feature.properties.kind === BUBBLE_KIND ? <BubbleSection feature={feature} /> : <SheetChoice feature={feature} />
}

function BubbleSection({ feature }: { feature: MapFeature }) {
  const editor = useEditor()
  const { data } = useElementFunctions()
  const serves = Array.isArray(feature.properties.serves) ? (feature.properties.serves as string[]) : []
  const functions = (data?.project ?? []).filter((fn) => editor.canEdit || serves.includes(fn.id))
  const inside = useMemo(() => insideBubble(feature, editor.features), [feature, editor.features])

  function toggle(id: string) {
    const properties = storedProperties(feature)
    const next = serves.includes(id) ? serves.filter((s) => s !== id) : [...serves, id]
    if (next.length === 0) delete properties.serves
    else properties.serves = next
    void saveFeature(editor, feature.properties.id, { properties })
  }

  const label = (f: MapFeature) => f.properties.name?.trim() || t(`editor.kinds.${f.properties.kind}`)

  return (
    <section className="space-y-3">
      {functions.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-loam-700">{t('tracing.bubble.serves')}</h3>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {functions.map((fn) => {
              const on = serves.includes(fn.id)
              return (
                <Button
                  key={fn.id} size="sm" variant={on ? 'primary' : 'ghost'} disabled={!editor.canEdit} aria-pressed={on} onClick={() => toggle(fn.id)}
                  className={clsx('gap-1 px-2.5 py-0.5', !on && 'font-normal ring-1 ring-inset ring-loam-200')}
                >
                  {on && <Check className="h-3.5 w-3.5" aria-hidden />}
                  {fn.name}
                </Button>
              )
            })}
          </div>
        </div>
      )}
      <div>
        <h3 className="text-sm font-medium text-loam-700">{t('tracing.section.inside_title')}</h3>
        {inside.length === 0 ? (
          <p className="mt-0.5 text-sm text-loam-500">{t('tracing.section.inside_none')}</p>
        ) : (
          <ul className="mt-1 flex flex-wrap gap-1.5">
            {inside.slice(0, SHOWN).map((f) => (
              <li key={f.properties.id}>
                <Button size="sm" variant="ghost" className="px-2.5 py-0.5 font-normal ring-1 ring-inset ring-loam-200" onClick={() => editor.select(f.properties.id)}>
                  {label(f)}
                </Button>
              </li>
            ))}
            {inside.length > SHOWN && <li className="self-center text-sm text-loam-500">{t('tracing.section.inside_more', { count: inside.length - SHOWN })}</li>}
          </ul>
        )}
      </div>
    </section>
  )
}

function SheetChoice({ feature }: { feature: MapFeature }) {
  const editor = useEditor()
  const current: Sheet | 'none' = isSheet(feature.properties.tracing) ? feature.properties.tracing : 'none'
  if (!editor.canEdit && current === 'none') return null

  function choose(next: Sheet | 'none') {
    const properties = storedProperties(feature)
    if (next === 'none') delete properties.tracing
    else properties.tracing = next
    void saveFeature(editor, feature.properties.id, { properties })
  }

  const options = [{ value: 'none' as const, label: t('tracing.section.none') }, ...SHEETS.map((s) => ({ value: s, label: t(`tracing.sheets.${s}`) }))]
  return (
    <section>
      <h3 className="text-sm font-medium text-loam-700">{t('tracing.section.title')}</h3>
      <p className="text-sm text-loam-500">{t('tracing.section.hint')}</p>
      {editor.canEdit ? (
        <Segmented value={current} options={options} onChange={choose} label={t('tracing.section.title')} className="mt-1.5 max-w-full overflow-x-auto" />
      ) : (
        <p className="mt-1 text-sm text-loam-800">{options.find((o) => o.value === current)?.label}</p>
      )}
    </section>
  )
}
