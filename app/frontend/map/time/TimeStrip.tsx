import clsx from 'clsx'
import { ChevronDown, Hourglass, Sun } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { formatDate } from '@/components/plants/format'
import { t } from '@/lib/i18n'
import { useEditor } from '@/map/editor/EditorContext'
import { noonElevation, SEASONS, type Season } from '@/map/time/growth'
import { availableMoments, FUTURE_YEARS, isFuture, momentDate, type Moment, type Timeline } from '@/map/time/moment'

/** Below this width (px) beside an open panel or inspector, the strip folds into one button. */
const FULL_WIDTH = 470

/** Each stop's dot grows with the garden: the bare land, today, then years 5, 15 and 30. */
const DOT: Record<Moment, string> = {
  arrival: 'h-2.5 w-2.5 bg-white ring-2 ring-loam-400',
  today: 'h-2 w-2',
  year5: 'h-2.5 w-2.5',
  year15: 'h-3.5 w-3.5',
  year30: 'h-4 w-4',
}

const yearOf = (date: string) => date.slice(0, 4)

function monthYear(date: string): string {
  return new Intl.DateTimeFormat('fr', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`))
}

/** « 20 oct. 2026 »: short enough for the strip's title on a phone. */
function shortDate(date: string): string {
  return new Intl.DateTimeFormat('fr', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`))
}

function title(moment: Moment, line: Timeline): string {
  const date = momentDate(moment, line)
  if (isFuture(moment)) return t('time_strip.title.future', { years: FUTURE_YEARS[moment], year: yearOf(date) })
  return t(`time_strip.title.${moment}`, { date: shortDate(date) })
}

function stopHint(moment: Moment, line: Timeline): string {
  const date = momentDate(moment, line)
  if (moment === 'arrival') return t('time_strip.stop_hints.arrival', { date: formatDate(date) })
  if (moment === 'today') return t('time_strip.stop_hints.today')
  return t('time_strip.stop_hints.future', { year: yearOf(date) })
}

function hint(moment: Moment, line: Timeline, drafts: boolean): string {
  if (moment === 'arrival') return t('time_strip.hints.arrival')
  if (moment === 'today') return t(drafts ? 'time_strip.hints.today_drafts' : 'time_strip.hints.today')
  const years = FUTURE_YEARS[moment]
  return drafts ? t('time_strip.hints.future_drafts', { years }) : t('time_strip.hints.future', { years, season: monthYear(line.nextSeason) })
}

/**
 * The time strip at the foot of the editor map: Arrivée · Aujourd'hui ·
 * An 5 · An 15 · An 30, and the noon shade of June or December. Crowns
 * grow from each plant's planting date (the 3D view's growth model), the
 * plan shows dashed today and grown in the years to come, and an AI's
 * drafts wait in the future. The moment lives in the editor
 * (`editor.moment`), remembered per map.
 */
export default function TimeStrip() {
  const editor = useEditor()
  const { moment, timeline, features, activePanel, selected } = editor
  const container = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(Infinity)
  const [unfolded, setUnfolded] = useState(false)

  useEffect(() => {
    const element = container.current
    if (!element || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  // An AI's draft opened from the drafts bar is a project: show it in the future.
  const draftSelected = selected?.properties.status === 'draft'
  const firstFuture = availableMoments(timeline).find(isFuture)
  useEffect(() => {
    if (!draftSelected || isFuture(moment) || !firstFuture) return
    editor.setMoment(firstFuture)
    editor.notify(t('time_strip.draft_shown', { years: FUTURE_YEARS[firstFuture] }))
  }, [draftSelected]) // eslint-disable-line react-hooks/exhaustive-deps

  if (features.length === 0) return null
  const drafts = features.some((f) => f.properties.status === 'draft')
  const beside = activePanel != null || selected != null
  const folded = beside && width < FULL_WIDTH

  const card = (
    <section
      aria-label={t('time_strip.label')}
      className="pointer-events-auto w-full space-y-2 rounded-2xl bg-white/95 px-3 pb-1.5 pt-2.5 shadow-[0_6px_16px_rgb(26_26_26/0.18)] ring-1 ring-loam-900/10 backdrop-blur md:w-[29rem]"
    >
      <div className="flex items-center gap-2">
        <Hourglass className="h-4 w-4 shrink-0 text-prune-600" aria-hidden />
        <p className="min-w-0 flex-1 truncate font-serif text-lg leading-tight text-loam-900" aria-live="polite">{title(moment, timeline)}</p>
        <ShadePicker />
      </div>
      <p className="hidden text-sm leading-snug text-loam-600 md:block">{hint(moment, timeline, drafts)}</p>
      {editor.shade && <p className="hidden text-sm leading-snug text-loam-500 md:block">{t(`time_strip.shade.note.${editor.shade}`)}</p>}
      <Stops />
    </section>
  )

  return (
    <div
      ref={container}
      className={clsx(
        'pointer-events-none absolute z-10 flex justify-center',
        // Phone: above the scale and the tool bar, out of the way of an open panel or selection.
        'inset-x-2 bottom-[5.25rem] md:bottom-4',
        beside && 'hidden md:flex',
        // From md up: clear of the guide card (bottom left, beside an open panel) and of the legend or the inspector (right).
        activePanel ? 'md:left-[calc(21.5rem+300px+1.5rem)]' : 'md:left-[calc(300px+2rem)]',
        selected ? 'md:right-[21.5rem]' : 'md:right-[19rem]',
      )}
    >
      {folded ? (
        <div className="pointer-events-auto relative">
          {unfolded && <div className="absolute bottom-full right-0 mb-2 w-[29rem] max-w-[calc(100vw-1rem)]">{card}</div>}
          <Button variant="secondary" size="sm" className="shadow-md" aria-expanded={unfolded} onClick={() => setUnfolded(!unfolded)} title={t(unfolded ? 'time_strip.close' : 'time_strip.open')}>
            <Hourglass className="h-4 w-4" aria-hidden />
            {t(`time_strip.stops.${moment}`)}
            <ChevronDown className={clsx('h-4 w-4 transition-transform', unfolded ? '' : 'rotate-180')} aria-hidden />
          </Button>
        </div>
      ) : card}
    </div>
  )
}

/** The stops on a pencil line, each dot a little bigger than the one before. */
function Stops() {
  const { moment, timeline, setMoment } = useEditor()
  const stops = availableMoments(timeline)
  return (
    <div role="group" aria-label={t('time_strip.label')} className="relative flex items-stretch justify-between">
      {/* The line the stops sit on. */}
      <span className="pointer-events-none absolute inset-x-6 top-[1.05rem] border-t border-dashed border-loam-300" aria-hidden />
      {stops.map((stop) => {
        const active = stop === moment
        return (
          <Button
            key={stop}
            variant="ghost"
            size="sm"
            aria-pressed={active}
            title={stopHint(stop, timeline)}
            onClick={() => setMoment(stop)}
            className={clsx('relative min-h-11 min-w-0 flex-1 flex-col !gap-1 !px-1 !py-1', active && 'bg-prune-50')}
          >
            <span className="flex h-4 items-center justify-center" aria-hidden>
              <span className={clsx('rounded-full', DOT[stop], stop !== 'arrival' && (active ? 'bg-prune-600 ring-2 ring-white' : 'bg-leaf-500 ring-2 ring-white'), stop === 'arrival' && active && 'ring-prune-600')} />
            </span>
            <span className={clsx('whitespace-nowrap text-sm leading-none', active ? 'font-semibold text-loam-900' : 'font-medium text-loam-600')}>
              {t(`time_strip.stops.${stop}`)}
            </span>
          </Button>
        )
      })}
    </div>
  )
}

/** « Ombre à midi »: June, December, or none (the same button again). */
function ShadePicker() {
  const { shade, setShade, map } = useEditor()
  const lat = map.center?.[1] ?? 50.5
  const pick = (season: Season) => setShade(shade === season ? null : season)
  return (
    <div role="group" aria-label={t('time_strip.shade.label')} className="flex shrink-0 items-center gap-0.5 rounded-full bg-loam-100 p-0.5">
      <Sun className="mx-1 h-4 w-4 text-humus-600" aria-hidden />
      <span className="sr-only">{t('time_strip.shade.label')}</span>
      {SEASONS.map((season) => (
        <Button
          key={season}
          variant="ghost"
          size="sm"
          aria-pressed={shade === season}
          title={t(`time_strip.shade.${season}_hint`, { angle: Math.round(noonElevation(lat, season)) })}
          onClick={() => pick(season)}
          className={clsx('min-h-8 !px-2.5 !py-0.5', shade === season && 'bg-white shadow-sm ring-1 ring-loam-200')}
        >
          {t(`time_strip.shade.${season}`)}
        </Button>
      ))}
    </div>
  )
}
