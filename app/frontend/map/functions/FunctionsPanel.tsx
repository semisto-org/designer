import { bbox as turfBbox } from '@turf/turf'
import { Footprints, LocateFixed } from 'lucide-react'
import { HelpButton } from '@/components/help/HelpButton'
import { Button } from '@/components/ui/Button'
import { t } from '@/lib/i18n'
import { useEditor } from '@/map/editor/EditorContext'
import { useElementFunctions, type FunctionBalance, type FunctionEntry } from '@/map/functions/store'

export const FUNCTIONS_HELP_SLUG = 'les-fonctions-des-elements'

/**
 * « Fonctions »: the element analysis of the design. Functions served by a
 * single element or by none come first, each with what to look for on the
 * land (what already does the job is often not drawn yet), then the needs
 * nothing on the place covers.
 */
export default function FunctionsPanel() {
  const editor = useEditor()
  const { data, failed } = useElementFunctions()
  const byKey = new Map((data?.entries ?? []).map((e) => [e.key, e]))
  const entriesOf = (keys: string[]) => keys.flatMap((k) => byKey.get(k) ?? [])

  function focus(entries: FunctionEntry[]) {
    const ids = new Set(entries.flatMap((e) => e.featureIds))
    const targets = editor.features.filter((f) => ids.has(f.properties.id))
    if (targets.length === 0) return
    const [minX, minY, maxX, maxY] = turfBbox({ type: 'FeatureCollection', features: targets })
    const { clientWidth: w, clientHeight: h } = editor.instance.getContainer()
    const padding = w >= 768
      ? { top: 70, bottom: 50, left: Math.round(Math.min(400, w * 0.3)), right: Math.round(Math.min(360, w * 0.28)) }
      : { top: 70, bottom: Math.round(h * 0.6), left: 30, right: 30 }
    editor.instance.fitBounds([minX, minY, maxX, maxY], { padding, maxZoom: 19, duration: 600 })
    editor.select(targets[0].properties.id)
  }

  const fragile = data?.balance.filter((b) => b.status === 'fragile') ?? []
  const missing = data?.balance.filter((b) => b.status === 'missing') ?? []
  const covered = data?.balance.filter((b) => b.status === 'covered') ?? []
  const name = (b: FunctionBalance) => t(`element_functions.names.${b.function}`)

  const look = (b: FunctionBalance) => (
    <p className="mt-1.5 flex items-start gap-1.5 text-sm text-loam-600">
      <Footprints className="mt-0.5 h-4 w-4 shrink-0 text-leaf-700" aria-label={t('element_functions.look_title')} />
      {t(`element_functions.look.${b.function}`)}
    </p>
  )

  return (
    <div className="space-y-4">
      <p className="text-sm text-loam-600">{t('element_functions.intro')}</p>
      <HelpButton slug={FUNCTIONS_HELP_SLUG} label={t('element_functions.help')} className="-ml-2" />
      {failed && <p className="text-sm text-clay-500">{t('element_functions.error')}</p>}
      {!data && !failed && <p className="text-sm text-loam-400">{t('element_functions.loading')}</p>}
      {data && data.entries.length === 0 && <p className="text-sm text-loam-500">{t('element_functions.empty')}</p>}

      {data && data.entries.length > 0 && (
        <>
          {fragile.length > 0 && (
            <section>
              <h3 className="mb-1.5 text-sm font-semibold text-loam-900">{t('element_functions.fragile_title')}</h3>
              <ul className="space-y-2.5">
                {fragile.map((b) => {
                  const entries = entriesOf(b.entries)
                  return (
                    <li key={b.function} className="rounded-lg p-3 ring-1 ring-humus-200">
                      <p className="text-sm font-semibold text-loam-900">{name(b)}</p>
                      <p className="mt-0.5 text-sm text-loam-600">{t('element_functions.fragile_one', { name: entries[0]?.label ?? '' })}</p>
                      {look(b)}
                      <Button variant="ghost" size="sm" onClick={() => focus(entries)} className="-ml-3 mt-1">
                        <LocateFixed className="h-3.5 w-3.5" aria-hidden />
                        {t('element_functions.show')}
                      </Button>
                    </li>
                  )
                })}
              </ul>
            </section>
          )}

          {missing.length > 0 && (
            <section>
              <h3 className="mb-1.5 text-sm font-semibold text-loam-900">{t('element_functions.missing_title')}</h3>
              <ul className="space-y-2.5">
                {missing.map((b) => (
                  <li key={b.function} className="rounded-lg p-3 ring-1 ring-loam-200">
                    <p className="text-sm font-semibold text-loam-900">{name(b)}</p>
                    {look(b)}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {covered.length > 0 && (
            <section>
              <h3 className="mb-1.5 text-sm font-semibold text-loam-900">{t('element_functions.covered_title')}</h3>
              <ul className="divide-y divide-loam-100">
                {covered.map((b) => (
                  <li key={b.function}>
                    <Button variant="ghost" size="sm" onClick={() => focus(entriesOf(b.entries))} className="w-full justify-between font-normal">
                      <span className="text-loam-800">{name(b)}</span>
                      <span className="text-loam-500">
                        {t('element_functions.covered_count', { count: b.count })}
                        {b.existingOnly && <span className="ml-1.5 text-humus-700">{t('element_functions.existing_only')}</span>}
                      </span>
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {data.unmetNeeds.length > 0 && (
            <section>
              <h3 className="mb-1 text-sm font-semibold text-loam-900">{t('element_functions.unmet_title')}</h3>
              <p className="mb-1.5 text-sm text-loam-600">{t('element_functions.unmet_intro')}</p>
              <ul className="space-y-1">
                {data.unmetNeeds.map((need) => {
                  const entries = entriesOf(need.entries)
                  return (
                    <li key={need.resource}>
                      <Button variant="ghost" size="sm" onClick={() => focus(entries)} className="-ml-3 h-auto text-left font-normal">
                        {t('element_functions.unmet_row', { resource: t(`element_functions.resources.${need.resource}`), names: entries.map((e) => e.label).join(', ') })}
                      </Button>
                    </li>
                  )
                })}
              </ul>
            </section>
          )}

          <p className="text-sm text-loam-500">{t('element_functions.plants_note')}</p>
        </>
      )}
    </div>
  )
}
