import clsx from 'clsx'
import { ChevronDown, NotebookPen } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { t } from '@/lib/i18n'
import { useEditor } from '@/map/editor/EditorContext'
import { useElementFunctions } from '@/map/functions/store'
import { ZoneCard } from '@/map/layout/ZoneLayer'
import { sectorView, useSectorView } from '@/map/sectors/store'
import { useDrawnView } from './DrawnViewOverlay'
import { marginNotes, type MarginNotes } from './margin'

const OPEN_KEY = 'designer:drawn-margin-open'

/** Open by default on a computer, folded on a phone where the map is small. */
function readOpen(): boolean {
  const wide = typeof window.matchMedia === 'function' && window.matchMedia('(min-width: 768px)').matches
  try {
    const stored = window.localStorage.getItem(OPEN_KEY)
    return stored == null ? wide : stored === '1'
  } catch {
    return wide
  }
}

/**
 * Always mounted in the editor; shows only in the drawn view. « Ce que le
 * lieu dit »: the challenges of the place, the functions nothing serves
 * yet, the sectors and the seasons never observed, written by hand in the
 * margin of the base plan, so they stay under the pencil while one designs.
 */
export default function PlaceMarginOverlay() {
  return useDrawnView() ? <PlaceMargin /> : null
}

function PlaceMargin() {
  const editor = useEditor()
  const { data } = useElementFunctions()
  const sectors = useSectorView()
  const [open, setOpen] = useState(readOpen)

  const notes: MarginNotes = useMemo(() => marginNotes({
    placeChallenges: data?.placeChallenges ?? [],
    functions: data?.project ?? [],
    sectorCount: editor.features.filter((f) => f.properties.kind === 'sector' && f.properties.status !== 'rejected').length,
    observedAt: editor.features
      .filter((f) => f.properties.kind === 'season_sign' || f.properties.kind === 'storm_observation')
      .map((f) => String(f.properties.observed_at ?? '')),
    now: new Date(),
  }), [data, editor.features])

  const toggle = () => {
    const next = !open
    setOpen(next)
    try {
      window.localStorage.setItem(OPEN_KEY, next ? '1' : '0')
    } catch {
      // Private browsing: the choice lasts until the page closes.
    }
  }

  const seasons = notes.missingSeasons.map((s) => t(`drawn_view.margin.seasons.${s}`)).join(', ')

  return (
    <ZoneCard id="place-margin" zone="bottom" order={4} className={clsx(open && 'w-full md:w-80')}>
      <section aria-label={t('drawn_view.margin.title')} className="rounded-2xl bg-loam-50/95 shadow-lg ring-1 ring-loam-900/10 backdrop-blur">
        <Button
          variant="ghost"
          onClick={toggle}
          aria-expanded={open}
          className="min-h-10 w-full !justify-start !rounded-2xl !px-3 text-left !text-loam-800 hover:!bg-loam-100"
        >
          <NotebookPen className="h-4 w-4 shrink-0 text-humus-700" aria-hidden />
          <span className="flex-1">{t('drawn_view.margin.title')}</span>
          {notes.count > 0 && <span className="rounded-full bg-loam-100 px-2 text-sm tabular-nums text-loam-700">{notes.count}</span>}
          <ChevronDown className={clsx('h-4 w-4 shrink-0 text-loam-500 transition-transform', open && 'rotate-180')} aria-hidden />
        </Button>
        {open && (
          <div className="max-h-[38dvh] space-y-3 overflow-y-auto px-3 pb-3 md:max-h-[min(26rem,50dvh)]">
            {notes.challenges.length > 0 && (
              <div>
                <p className="text-sm font-semibold text-loam-600">{t('drawn_view.margin.challenges')}</p>
                <ul className="mt-0.5 space-y-0.5">
                  {notes.challenges.map((c) => <li key={c} className="-rotate-[0.5deg] font-hand text-xl leading-tight text-humus-800">{c}</li>)}
                </ul>
              </div>
            )}
            {notes.unserved.length > 0 && (
              <div>
                <p className="text-sm font-semibold text-loam-600">{t('drawn_view.margin.unserved')}</p>
                <ul className="mt-0.5 space-y-0.5">
                  {notes.unserved.map((name) => <li key={name} className="font-hand text-xl leading-tight text-prune-700">{name}</li>)}
                </ul>
                <Button variant="ghost" size="sm" className="-ml-3" onClick={() => editor.openPanel('functions')}>{t('drawn_view.margin.open_functions')}</Button>
              </div>
            )}
            <div>
              <p className="text-sm font-semibold text-loam-600">{t('drawn_view.margin.sectors')}</p>
              {notes.sectorCount > 0 ? (
                <label className="mt-1 flex items-center gap-2 text-sm text-loam-700">
                  <input type="checkbox" checked={sectors.onMap} onChange={(e) => sectorView.setOnMap(e.target.checked)} className="h-4 w-4 rounded border-loam-300 text-prune-600" />
                  {t('drawn_view.margin.show_sectors', { count: notes.sectorCount })}
                </label>
              ) : (
                <>
                  <p className="font-hand text-xl leading-tight text-loam-600">{t('drawn_view.margin.no_sectors')}</p>
                  <Button variant="ghost" size="sm" className="-ml-3" onClick={() => editor.openPanel('sectors')}>{t('drawn_view.margin.open_sectors')}</Button>
                </>
              )}
            </div>
            {notes.missingSeasons.length > 0 && (
              <div>
                <p className="text-sm font-semibold text-loam-600">{t('drawn_view.margin.seasons_title')}</p>
                <p className="font-hand text-xl leading-tight text-leaf-800">{t('drawn_view.margin.seasons_missing', { seasons })}</p>
                <p className="mt-0.5 text-sm text-loam-600">{t('drawn_view.margin.go_outside')}</p>
              </div>
            )}
            {notes.challenges.length === 0 && (
              <div className="text-sm text-loam-600">
                <p>{t('drawn_view.margin.no_challenges')}</p>
                <Button variant="ghost" size="sm" className="-ml-3" onClick={() => editor.openPanel('project')}>{t('drawn_view.margin.open_project')}</Button>
              </div>
            )}
          </div>
        )}
      </section>
    </ZoneCard>
  )
}
