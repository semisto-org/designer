import { t } from '@/lib/i18n'
import { duration } from '@/map/sun/geometry'
import type { SunMonth } from '@/map/sun/types'

const monthName = new Intl.DateTimeFormat('fr-BE', { month: 'short' })

/**
 * The 21st of each month: hours of direct sun on the terrain (watercolour
 * bar) inside the hours of daylight over an open horizon (pencil outline),
 * and the month's irradiation when PVGIS gave it.
 */
export function SunMonths({ months }: { months: SunMonth[] }) {
  const longest = Math.max(...months.map((m) => m.openHours), 1)
  const hasTerrain = months.some((m) => m.terrainHours != null)
  const hasIrradiation = months.some((m) => m.irradiationKwhM2 != null)

  return (
    <section>
      <h3 className="font-serif text-lg text-loam-900">{t('sun.months.title')}</h3>
      <p className="font-hand text-base leading-tight text-prune-600">{t('sun.months.subtitle')}</p>
      <div className="mt-2 flex items-center gap-3 text-[11px] text-loam-500">
        {hasTerrain && <span className="flex items-center gap-1"><span className="h-2 w-3 rounded-sm bg-humus-300" />{t('sun.months.terrain')}</span>}
        <span className="flex items-center gap-1"><span className="h-2 w-3 rounded-sm border border-loam-400" />{t('sun.months.open')}</span>
        {hasIrradiation && <span className="ml-auto">{t('sun.months.irradiation')}</span>}
      </div>
      <ol className="mt-1.5 space-y-1">
        {months.map((month) => {
          const name = monthName.format(new Date(2026, month.month - 1, 21))
          const label = month.terrainHours != null
            ? t('sun.months.row', { month: name, terrain: duration(month.terrainHours), open: duration(month.openHours) })
            : t('sun.months.row_open', { month: name, open: duration(month.openHours) })
          return (
            <li key={month.month} className="grid grid-cols-[2.4rem_1fr_auto] items-center gap-2 text-[11px]" aria-label={label}>
              <span className="text-loam-600">{name}</span>
              <span className="relative h-3" aria-hidden="true">
                <span className="absolute inset-y-0 left-0 rounded-sm border border-loam-400/70" style={{ width: `${(month.openHours / longest) * 100}%` }} />
                {month.terrainHours != null && (
                  <span className="absolute inset-y-[2px] left-[2px] rounded-sm bg-humus-300/80" style={{ width: `calc(${(month.terrainHours / longest) * 100}% - 4px)` }} />
                )}
              </span>
              <span className="flex items-baseline gap-2 whitespace-nowrap tabular-nums" aria-hidden="true">
                <span className="w-[6.2rem] text-right">
                  <span className="font-medium text-loam-800">{duration(month.terrainHours ?? month.openHours)}</span>
                  {month.terrainHours != null && <span className="text-loam-400"> / {duration(month.openHours)}</span>}
                </span>
                {hasIrradiation && <span className="w-7 text-right text-loam-500">{month.irradiationKwhM2 != null ? Math.round(month.irradiationKwhM2) : '–'}</span>}
              </span>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
