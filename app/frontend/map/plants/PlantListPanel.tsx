import { Download, Printer } from 'lucide-react'
import { buttonClass } from '@/components/ui/Button'
import { strataLabel } from '@/components/plants/format'
import { t } from '@/lib/i18n'
import { useEditor } from '@/map/editor/EditorContext'
import { AlertsList } from '@/map/plants/AlertsList'
import { usePlanting } from '@/map/plants/store'
import { StrataDot } from '@/map/plants/strata'
import { STRATA, type PlantListRow } from '@/types/plants'

/** « Liste de plants »: what to order and plant, its exports, and the plan's coherence. */
export default function PlantListPanel() {
  const editor = useEditor()
  const mapId = editor.map.id
  const { data, error } = usePlanting(mapId)
  if (error) return <p className="text-sm text-clay-500">{t('plant_list.load_error')}</p>
  if (!data) return <p className="text-sm text-loam-400">{t('common.loading')}</p>
  const list = data.list
  const groups = STRATA.map((strata) => ({ strata, rows: list.rows.filter((r) => r.strata === strata) })).filter((g) => g.rows.length)

  return (
    <div className="space-y-5 text-sm">
      <p className="text-xs text-loam-500">{t('plant_list.intro')}</p>
      {list.total > 0 && (
        <div>
          <p className="text-base font-semibold text-loam-900">{t('plant_list.totals', { total: list.total, species: list.speciesCount })}</p>
          <p className="mt-0.5 text-xs text-loam-500">
            {t('plant_list.isolated', { count: list.rows.reduce((s, r) => s + r.isolated, 0) })} · {t('plant_list.composed', { count: list.rows.reduce((s, r) => s + r.composed, 0) })} · {t('plant_list.planted', { count: list.planted })}
          </p>
        </div>
      )}
      {list.total === 0 ? (
        <p className="rounded-lg border border-dashed border-loam-300 p-3 text-xs text-loam-500">{t('plant_list.empty')}</p>
      ) : (
        <div className="space-y-3">
          {groups.map(({ strata, rows }) => (
            <div key={strata}>
              <h3 className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-loam-500">
                <StrataDot strata={strata} />{strataLabel(strata)}
              </h3>
              <ul className="divide-y divide-loam-100">
                {rows.map((row) => <ListRow key={`${row.speciesId}-${row.varietyId ?? ''}`} row={row} />)}
              </ul>
            </div>
          ))}
        </div>
      )}
      {list.unlinked > 0 && <p className="text-xs text-humus-700">{t('plant_list.unlinked', { count: list.unlinked })}</p>}

      <div className="flex flex-wrap gap-2">
        <a href={`/maps/${mapId}/plant_list.csv`} download className={buttonClass('secondary', 'sm')} aria-disabled={list.total === 0}>
          <Download className="h-4 w-4" />{t('plant_list.export_csv')}
        </a>
        <a href={`/maps/${mapId}/plant_list/print`} target="_blank" rel="noreferrer" className={buttonClass('secondary', 'sm')}>
          <Printer className="h-4 w-4" />{t('plant_list.print')}
        </a>
      </div>

      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-loam-500">{t('plant_list.coherence')}</h3>
        {data.zone == null && <p className="mb-2 text-xs text-loam-500">{t('plant_alerts.zone_unknown')}</p>}
        {data.alerts.alerts.length === 0
          ? <p className="text-xs text-leaf-700">{t('plant_list.coherence_none')}</p>
          : <AlertsList alerts={data.alerts.alerts} />}
      </section>
    </div>
  )
}

function ListRow({ row }: { row: PlantListRow }) {
  return (
    <li className="flex items-baseline justify-between gap-3 py-1.5">
      <div className="min-w-0">
        <p className="truncate text-loam-800">{row.varietyName ? `${row.commonName ?? row.latinName} '${row.varietyName}'` : row.commonName ?? row.latinName}</p>
        <p className="truncate text-xs italic text-loam-500">{row.latinName}</p>
      </div>
      <div className="shrink-0 text-right">
        <p className="font-semibold tabular-nums text-loam-900">{row.total}</p>
        <p className="text-[11px] text-loam-400" title={t('plant_list.split', { isolated: row.isolated, composed: row.composed })}>
          {row.composed > 0 && row.isolated > 0
            ? `${row.isolated} + ${row.composed}`
            : row.composed > 0 ? t('plant_list.in_patches', { count: row.total }) : t('plant_list.alone', { count: row.total })}
        </p>
      </div>
    </li>
  )
}
