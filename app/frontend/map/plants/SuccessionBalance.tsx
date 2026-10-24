import { CalendarClock, Scissors, Shovel } from 'lucide-react'
import { t } from '@/lib/i18n'
import type { SuccessionAction, SuccessionBalanceData } from '@/types/plants'

/** The hatching of support plants on the map, for their part of a bar. */
const SUPPORT_STRIPES = 'repeating-linear-gradient(135deg, var(--color-leaf-500) 0 3px, var(--color-leaf-200) 3px 6px)'

/**
 * « Soutien et productifs »: the support trees and shrubs against the
 * productive ones in years 1, 5, 15 and 30, so the person sees the support
 * plants make room as the fruit trees grow, and what to do outside this
 * year because of it (SuccessionBalance on the server).
 */
export function SuccessionBalance({ data }: { data: SuccessionBalanceData | undefined }) {
  if (!data || data.supportTotal + data.productiveTotal === 0) return null
  const max = Math.max(1, ...data.years.map((y) => y.support + y.productive))
  return (
    <section data-testid="succession-balance">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-loam-500">{t('palette.succession.title')}</h3>
      <p className="mb-2 text-sm text-loam-400">{t('palette.succession.hint')}</p>
      <ol className="grid grid-cols-4 gap-2">
        {data.years.map((y) => {
          const total = y.support + y.productive
          return (
            <li key={y.year} className="flex flex-col items-center gap-1 text-sm">
              {/* Bars grow from the ground: support (hatched) under the productive part. */}
              <span className="flex h-16 w-7 flex-col-reverse overflow-hidden rounded-md bg-loam-100" aria-hidden="true">
                <span className="block w-full" style={{ height: `${(y.support / max) * 100}%`, background: SUPPORT_STRIPES }} />
                <span className="block w-full bg-prune-400" style={{ height: `${(y.productive / max) * 100}%` }} />
              </span>
              <span className="font-medium text-loam-800">{t('palette.succession.year', { year: y.year })}</span>
              <span className="text-loam-500 tabular-nums">{y.calendarYear}</span>
              <span className="sr-only">{t('palette.succession.counts', { support: y.support, productive: y.productive })}</span>
              <span className="tabular-nums text-loam-700" aria-hidden="true">
                {total === 0 ? '–' : <><span className="text-leaf-800">{y.support}</span> · <span className="text-prune-700">{y.productive}</span></>}
              </span>
            </li>
          )
        })}
      </ol>
      <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-loam-600">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-sm" style={{ background: SUPPORT_STRIPES }} aria-hidden="true" />{t('palette.succession.support')}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-sm bg-prune-400" aria-hidden="true" />{t('palette.succession.productive')}
        </span>
      </p>
      {data.advice.map((key) => (
        <p key={key} className="mt-2 rounded-lg bg-humus-50 p-2 text-sm text-humus-900">{t(`palette.succession.advice.${key}`)}</p>
      ))}
      {data.actions.length > 0 && (
        <div className="mt-3">
          <h4 className="text-sm font-medium text-loam-700">{t('palette.succession.outside')}</h4>
          <ul className="mt-1 space-y-1.5">
            {data.actions.map((action) => <Action key={action.key} action={action} />)}
          </ul>
        </div>
      )}
    </section>
  )
}

const ICONS = { chop_and_drop: Scissors, give_way: Shovel, unscheduled: CalendarClock }

function Action({ action }: { action: SuccessionAction }) {
  const Icon = ICONS[action.key]
  const vars: Record<string, number> = action.key === 'give_way' ? { count: action.count, year: action.year } : { count: action.count }
  return (
    <li className="flex items-start gap-2 text-sm text-loam-700">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-leaf-700" aria-hidden="true" />
      <span>{t(`palette.succession.actions.${action.key}`, vars)}</span>
    </li>
  )
}
