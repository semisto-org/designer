import { bbox as turfBbox } from '@turf/turf'
import clsx from 'clsx'
import { useState } from 'react'
import { Footprints, LocateFixed, NotebookPen } from 'lucide-react'
import { HelpButton } from '@/components/help/HelpButton'
import { Button, ButtonLink } from '@/components/ui/Button'
import { t } from '@/lib/i18n'
import { useEditor } from '@/map/editor/EditorContext'
import { useFeatureHighlight } from '@/map/functions/highlight'
import { useElementFunctions, type FunctionBalance, type FunctionEntry, type ProjectFunction } from '@/map/functions/store'

export const FUNCTIONS_HELP_SLUG = 'les-fonctions-des-elements'

/**
 * « Fonctions »: the element analysis of the design. Functions served by a
 * single element or by none come first, each with what to look for on the
 * land (what already does the job is often not drawn yet), then the needs
 * nothing on the place covers. The project's own functions (the functional
 * analysis of the project sheet) come first, with the elements serving them,
 * and the challenges the place itself raises, to go and look at.
 */
export default function FunctionsPanel() {
  const editor = useEditor()
  const { data, failed } = useElementFunctions()
  const byKey = new Map((data?.entries ?? []).map((e) => [e.key, e]))
  const entriesOf = (keys: string[]) => keys.flatMap((k) => byKey.get(k) ?? [])
  const highlight = useFeatureHighlight(editor.instance)
  // The row whose elements are put forward on the map; a second click lets go.
  const [shown, setShown] = useState<string | null>(null)

  function focus(entries: FunctionEntry[], key: string) {
    if (shown === key) {
      setShown(null)
      highlight.clear()
      return
    }
    const ids = new Set(entries.flatMap((e) => e.featureIds))
    const targets = editor.features.filter((f) => ids.has(f.properties.id))
    if (targets.length === 0) return
    setShown(key)
    highlight.show(targets)
    const [minX, minY, maxX, maxY] = turfBbox({ type: 'FeatureCollection', features: targets })
    const { clientWidth: w, clientHeight: h } = editor.instance.getContainer()
    const padding = w >= 768
      ? { top: 70, bottom: 50, left: Math.round(Math.min(400, w * 0.3)), right: Math.round(Math.min(360, w * 0.28)) }
      // Below the header and the « À faire » card, above the sheet.
      : { top: 160, bottom: Math.round(h * 0.55), left: 30, right: 30 }
    editor.instance.fitBounds([minX, minY, maxX, maxY], { padding, maxZoom: 19, duration: 600 })
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
      {data && <ProjectFunctions data={data.project} challenges={data.placeChallenges} entriesOf={entriesOf} focus={focus} shown={shown} mapId={editor.map.id} canEdit={editor.canEdit} />}
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
                      <ShowButton active={shown === `fragile:${b.function}`} onClick={() => focus(entries, `fragile:${b.function}`)} className="-ml-3 mt-1" />
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
                {covered.map((b) => {
                  const key = `covered:${b.function}`
                  return (
                    <li key={b.function}>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-pressed={shown === key}
                        onClick={() => focus(entriesOf(b.entries), key)}
                        className={clsx('h-auto w-full !items-start !justify-between gap-3 rounded-lg text-left font-normal', shown === key && 'bg-humus-50 ring-1 ring-inset ring-humus-300')}
                      >
                        <span className="min-w-0">
                          <span className="block font-semibold text-loam-900">{name(b)}</span>
                          {b.existingOnly && <span className="block text-humus-700">{t('element_functions.existing_only')}</span>}
                        </span>
                        <span className="shrink-0 text-right text-loam-500">{t('element_functions.covered_count', { count: b.count })}</span>
                      </Button>
                    </li>
                  )
                })}
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
                      <Button variant="ghost" size="sm" aria-pressed={shown === `need:${need.resource}`} onClick={() => focus(entries, `need:${need.resource}`)} className={clsx('-ml-3 h-auto !justify-start rounded-lg text-left font-normal', shown === `need:${need.resource}` && 'bg-humus-50 ring-1 ring-inset ring-humus-300')}>
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

/** The functions of the project's functional analysis, and the place's challenges. */
function ProjectFunctions({ data, challenges, entriesOf, focus, shown, mapId, canEdit }: {
  data: ProjectFunction[]
  challenges: string[]
  entriesOf: (keys: string[]) => FunctionEntry[]
  focus: (entries: FunctionEntry[], key: string) => void
  shown: string | null
  mapId: number
  canEdit: boolean
}) {
  const sheetLink = (
    <ButtonLink href={`/maps/${mapId}/project#analysis`} variant="ghost" size="sm" className="-ml-3">
      <NotebookPen className="h-3.5 w-3.5" aria-hidden />
      {t('element_functions.project.open_sheet')}
    </ButtonLink>
  )
  const sources = (['holder', 'place'] as const).map((source) => ({ source, rows: data.filter((f) => f.source === source) })).filter((g) => g.rows.length > 0)

  return (
    <>
      <section className="rounded-2xl bg-loam-50 p-3">
        <h3 className="font-serif text-lg text-loam-900">{t('element_functions.project.title')}</h3>
        {data.length === 0 ? (
          <>
            <p className="mt-1 text-sm text-loam-600">{t('element_functions.project.empty')}</p>
            {canEdit && sheetLink}
          </>
        ) : (
          <>
            <p className="mt-1 text-sm text-loam-600">{t('element_functions.project.intro')}</p>
            {sources.map(({ source, rows }) => (
              <div key={source} className="mt-3">
                <p className="text-sm font-medium text-loam-700">{t(`element_functions.project.sources.${source}`)}</p>
                <ul className="mt-1 space-y-1.5">
                  {rows.map((fn) => {
                    const entries = entriesOf(fn.entries)
                    return (
                      <li key={fn.id} className={clsx('rounded-lg bg-white px-3 py-2 ring-1', fn.status === 'covered' ? 'ring-loam-200' : 'ring-humus-200')}>
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="text-sm font-semibold text-loam-900">{fn.name}</span>
                          {fn.status === 'covered' && <span className="shrink-0 text-sm text-loam-500">{t('element_functions.project.covered', { count: fn.count })}</span>}
                        </div>
                        {fn.status === 'missing' && <p className="mt-0.5 text-sm text-humus-700">{t('element_functions.project.missing')}</p>}
                        {fn.status === 'fragile' && <p className="mt-0.5 text-sm text-humus-700">{t('element_functions.project.fragile', { name: entries[0]?.label ?? '' })}</p>}
                        {entries.length > 0 && (
                          <ShowButton active={shown === `project:${fn.id}`} onClick={() => focus(entries, `project:${fn.id}`)} className="-ml-3 mt-0.5" />
                        )}
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}
            {canEdit && <div className="mt-2">{sheetLink}</div>}
          </>
        )}
      </section>

      {challenges.length > 0 && (
        <section>
          <h3 className="mb-1 text-sm font-semibold text-loam-900">{t('element_functions.place_challenges.title')}</h3>
          <p className="mb-1.5 text-sm text-loam-600">{t('element_functions.place_challenges.intro')}</p>
          <ul className="space-y-1">
            {challenges.map((challenge, index) => (
              <li key={index} className="flex items-start gap-1.5 text-sm text-loam-800">
                <Footprints className="mt-0.5 h-4 w-4 shrink-0 text-leaf-700" aria-hidden />
                {challenge}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  )
}

/** « Montrer sur la carte », pressed while its elements are put forward. */
function ShowButton({ active, onClick, className }: { active: boolean; onClick: () => void; className?: string }) {
  return (
    <Button variant="ghost" size="sm" aria-pressed={active} onClick={onClick} className={clsx(className, active && 'bg-humus-50 ring-1 ring-inset ring-humus-300')}>
      <LocateFixed className="h-3.5 w-3.5" aria-hidden />
      {t(active ? 'element_functions.hide' : 'element_functions.show')}
    </Button>
  )
}
