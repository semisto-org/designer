import { t } from '@/lib/i18n'
import type { ListedMap } from '@/types/teams'
import { STRATA_COLORS, STRATA_ORDER } from './sketch'

/** The palette as a strip of the forest's layers; with `legend`, their counts. */
export function PaletteStrip({ map, legend = false }: { map: ListedMap; legend?: boolean }) {
  const palette = map.sketch?.palette ?? {}
  const strata = STRATA_ORDER.filter((s) => palette[s])
  const total = strata.reduce((sum, s) => sum + palette[s], 0)
  const placed = map.sketch?.plants.length ?? 0
  if (total === 0) return <p className="text-xs text-loam-500">{t('my_maps.palette.empty')}</p>
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs text-loam-500">
        {placed > 0 && <>{t('my_maps.palette.placed', { count: placed })} · </>}
        {t('my_maps.palette.species', { count: total })}
      </p>
      <div className="flex h-2 overflow-hidden rounded-full bg-loam-200" aria-hidden="true">
        {strata.map((s) => (
          <i key={s} className="block h-full opacity-85" style={{ width: `${(100 * palette[s]) / total}%`, background: STRATA_COLORS[s] }} />
        ))}
      </div>
      {legend && (
        <ul className="flex flex-wrap gap-x-2.5 gap-y-1 text-[11px] text-loam-500">
          {strata.map((s) => (
            <li key={s} className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: STRATA_COLORS[s] }} aria-hidden="true" />
              {t(`plants.strata.${s}`)} {palette[s]}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
