// « Au fil de l'année »: the palette seen through the months. On top, « Ce
// mois-ci sur ton terrain »: what the plants of the map do this month
// (flowering, harvest, pruning, from the catalogue) and the signs of the
// season worth going out for, with when each was last seen on this land
// (Maps::ThisMonth). Below, one line per species of the palette across the
// twelve months, the current month circled, so the person sees what is coming
// and when to go and look.
import clsx from 'clsx'
import { Flower2, Footprints, Scissors, ShoppingBasket } from 'lucide-react'
import { useEffect, useRef, type ReactNode } from 'react'
import { formatDate, MONTH_KEYS } from '@/components/plants/format'
import { Button } from '@/components/ui/Button'
import { HandNote } from '@/components/ui/HandNote'
import { Pill } from '@/components/ui/Pill'
import { t } from '@/lib/i18n'
import { STRATA_COLORS } from '@/map/plants/strataColors'
import { STRATA_ORDER, type PaletteRow } from '@/palette/table'

export type ThisMonth = {
  month: number
  monthName: string
  plants: Record<'flowering' | 'harvest' | 'pruning', { names: string[]; count: number }>
  signs: { sign: string; label: string; hint: string | null; lastSeenOn: string | null; seenThisYear: boolean }[]
  unobserved: string[]
}

/** The species to draw: those with a calendar, by layer (tallest first), then by name. */
export function yearRows(rows: PaletteRow[]): PaletteRow[] {
  return rows
    .filter((row) => row.floweringMonths.length > 0 || row.harvestMonths.length > 0)
    .sort((a, b) => rank(a.strata) - rank(b.strata) || a.name.localeCompare(b.name, 'fr'))
}
const rank = (strata: string) => { const i = STRATA_ORDER.indexOf(strata); return i < 0 ? STRATA_ORDER.length : i }

export function YearView({ thisMonth, rows, onOpen }: { thisMonth: ThisMonth; rows: PaletteRow[]; onOpen: (row: PaletteRow) => void }) {
  const lines = yearRows(rows)
  // On a phone the twelve months do not fit: open the table on this month.
  const scroller = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const box = scroller.current
    const now = box?.querySelector<HTMLElement>('[data-now]')
    if (box && now && box.scrollWidth > box.clientWidth) box.scrollLeft = Math.max(0, now.offsetLeft - box.clientWidth / 2)
  }, [])
  return (
    <div className="space-y-6">
      <MonthCard thisMonth={thisMonth} />
      <section aria-labelledby="palette-year-title" className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-loam-900/10 sm:p-5">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 id="palette-year-title" className="font-serif text-2xl text-loam-900">{t('plant_palette.year.title')}</h2>
          <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-loam-600">
            <span className="inline-flex items-center gap-1.5"><span aria-hidden className="h-2 w-4 rounded-full bg-prune-300" />{t('plant_palette.year.flowering')}</span>
            <span className="inline-flex items-center gap-1.5"><span aria-hidden className="h-2 w-4 rounded-full bg-humus-400" />{t('plant_palette.year.harvest')}</span>
            <span className="inline-flex items-center gap-1.5"><span aria-hidden className="h-4 w-4 rounded ring-2 ring-leaf-600" />{t('plant_palette.year.now', { month: thisMonth.monthName })}</span>
          </p>
        </div>
        {lines.length === 0 ? (
          <p className="text-sm text-loam-600">{t('plant_palette.year.empty')}</p>
        ) : (
          <div ref={scroller} className="overflow-x-auto">
            <table className="w-full min-w-[34rem] table-fixed border-separate border-spacing-x-0.5 border-spacing-y-1 text-sm">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 w-32 bg-white text-left font-normal text-loam-500 sm:w-52"><span className="sr-only">{t('plant_palette.year.species')}</span></th>
                  {MONTH_KEYS.map((key, i) => (
                    <th key={key} scope="col" title={t(`plants.vocabulary.months.${key}`)} data-now={i + 1 === thisMonth.month || undefined}
                      className={clsx('font-normal', i + 1 === thisMonth.month ? 'font-semibold text-leaf-800' : 'text-loam-500')}>
                      <span className="sm:hidden">{t(`plants.vocabulary.months_initial.${key}`)}</span>
                      <span className="hidden sm:inline">{t(`plants.vocabulary.months_short.${key}`)}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lines.map((row) => (
                  <tr key={row.key}>
                    <th scope="row" className="sticky left-0 z-10 bg-white pr-2 text-left font-normal">
                      <Button variant="ghost" size="sm" onClick={() => onOpen(row)} className="-ml-3 max-w-full justify-start text-left">
                        <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: STRATA_COLORS[row.strata as keyof typeof STRATA_COLORS] ?? 'var(--color-loam-300)' }} />
                        <span className="truncate text-loam-800">{row.name}</span>
                      </Button>
                    </th>
                    {MONTH_KEYS.map((key, i) => {
                      const month = i + 1
                      const flowers = row.floweringMonths.includes(month)
                      const harvest = row.harvestMonths.includes(month)
                      const words = [flowers && t('plant_palette.year.flowering'), harvest && t('plant_palette.year.harvest')].filter(Boolean).join(', ')
                      return (
                        <td key={key} className={clsx('h-7 rounded-md px-0.5', month === thisMonth.month ? 'bg-leaf-50 ring-2 ring-inset ring-leaf-600' : 'bg-loam-50')}>
                          <div className="flex h-full flex-col justify-center gap-0.5">
                            <span aria-hidden className={clsx('h-1.5 rounded-full', flowers ? 'bg-prune-300' : 'bg-transparent')} />
                            <span aria-hidden className={clsx('h-1.5 rounded-full', harvest ? 'bg-humus-400' : 'bg-transparent')} />
                          </div>
                          {words && <span className="sr-only">{t(`plants.vocabulary.months.${key}`)} : {words}</span>}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-sm text-loam-500">{t('plant_palette.year.source')}</p>
      </section>
    </div>
  )
}

/** « Ce mois-ci sur ton terrain »: what to go and see outside this month. */
function MonthCard({ thisMonth }: { thisMonth: ThisMonth }) {
  const { plants, signs } = thisMonth
  return (
    <section aria-labelledby="palette-month-title" className="rounded-2xl bg-loam-100/70 p-4 ring-1 ring-loam-900/10 sm:p-5">
      <p className="text-sm font-semibold uppercase tracking-wide text-loam-500">{t('plant_palette.month.eyebrow')}</p>
      <h2 id="palette-month-title" className="mt-1 font-serif text-3xl text-loam-900">{t('plant_palette.month.title', { month: thisMonth.monthName })}</h2>
      <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <div className="space-y-3">
          <PlantGroup icon={<Flower2 className="h-4 w-4" />} title={t('plant_palette.month.flowering')} group={plants.flowering} none={t('plant_palette.month.none_flowering')} />
          <PlantGroup icon={<ShoppingBasket className="h-4 w-4" />} title={t('plant_palette.month.harvest')} group={plants.harvest} none={t('plant_palette.month.none_harvest')} />
          {plants.pruning.count > 0 && <PlantGroup icon={<Scissors className="h-4 w-4" />} title={t('plant_palette.month.pruning')} group={plants.pruning} none="" />}
        </div>
        <div>
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-loam-800"><Footprints className="h-4 w-4" aria-hidden />{t('plant_palette.month.signs')}</h3>
          <ul className="mt-2 space-y-2">
            {signs.map((sign) => (
              <li key={sign.sign} className="rounded-xl bg-white px-3 py-2 ring-1 ring-loam-900/5">
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                  <span className="font-medium text-loam-900">{sign.label}</span>
                  {sign.seenThisYear
                    ? <Pill tone="leaf">{t('plant_palette.month.seen_on', { date: formatDate(sign.lastSeenOn) })}</Pill>
                    : <Pill tone="humus">{t('plant_palette.month.to_see')}</Pill>}
                </div>
                {sign.hint && <p className="mt-0.5 text-sm text-loam-600">{sign.hint}</p>}
              </li>
            ))}
          </ul>
          <HandNote tone="leaf" className="mt-3">{t('plant_palette.month.outside')}</HandNote>
        </div>
      </div>
    </section>
  )
}

function PlantGroup({ icon, title, group, none }: { icon: ReactNode; title: string; group: { names: string[]; count: number }; none: string }) {
  const more = group.count - group.names.length
  return (
    <div>
      <h3 className="flex items-center gap-1.5 text-sm font-semibold text-loam-800"><span aria-hidden>{icon}</span>{title}</h3>
      {group.count === 0
        ? <p className="mt-0.5 text-sm text-loam-600">{none}</p>
        : <p className="mt-0.5 text-loam-800">{group.names.join(', ')}{more > 0 && ` ${t('plant_palette.month.more', { count: more })}`}</p>}
    </div>
  )
}
