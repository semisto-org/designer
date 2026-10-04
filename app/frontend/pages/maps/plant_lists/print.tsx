import { Head, Link } from '@inertiajs/react'
import { ArrowLeft, Printer } from 'lucide-react'
import type { ReactNode } from 'react'
import { Logo } from '@/components/Logo'
import { HelpButton } from '@/components/help/HelpButton'
import { Button } from '@/components/ui/Button'
import { formatDate, formatDecimal, strataLabel } from '@/components/plants/format'
import { formatArea, t } from '@/lib/i18n'
import { STRATA_COLORS } from '@/map/plants/strata'
import { STRATA, type PlantListData, type PlantingAlerts } from '@/types/plants'

type Props = {
  map: { id: number; name: string; areaM2: number | null; ownerName: string }
  list: PlantListData
  alerts: PlantingAlerts
  generatedOn: string
}

/** The plant list on paper: to order from a nursery or take to the field. */
export default function PlantListPrint({ map, list, alerts, generatedOn }: Props) {
  const groups = STRATA.map((strata) => ({ strata, rows: list.rows.filter((r) => r.strata === strata) })).filter((g) => g.rows.length)
  return (
    <div className="min-h-dvh bg-white text-loam-900 print:min-h-0">
      <Head title={`${t('plant_list.print_page.title')} · ${map.name}`} />
      <div className="mx-auto max-w-4xl px-4 py-6 print:max-w-none print:px-0 print:py-0">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-2 print:hidden">
          <Link href={`/maps/${map.id}`} className="inline-flex items-center gap-1 text-sm text-loam-500 hover:text-loam-800">
            <ArrowLeft className="h-4 w-4" />{t('plant_list.print_page.back')}
          </Link>
          <div className="flex items-center gap-2">
            <HelpButton compact slug="la-liste-de-plants-et-la-commande" />
            <Button onClick={() => window.print()}><Printer className="h-4 w-4" />{t('plant_list.print_page.print')}</Button>
          </div>
        </div>

        <header className="flex items-start justify-between gap-4 border-b border-loam-200 pb-4">
          <div>
            <h1 className="text-2xl">{t('plant_list.print_page.title')}</h1>
            <p className="mt-1 text-sm text-loam-600">{t('plant_list.print_page.subtitle', { map: map.name, date: formatDate(generatedOn) })}</p>
            <p className="mt-1 text-sm text-loam-600">
              {t('plant_list.print_page.totals', { total: list.total, species: list.speciesCount })}
              {map.areaM2 != null && <> · {formatArea(map.areaM2)}</>}
            </p>
          </div>
          <Logo />
        </header>

        {list.rows.length === 0 ? (
          <p className="mt-6 text-sm text-loam-500">{t('plant_list.empty')}</p>
        ) : (
          <table className="mt-4 w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-loam-300 text-left text-xs uppercase tracking-wide text-loam-500">
                <Th>{t('plant_list.columns.name')}</Th>
                <Th className="hidden sm:table-cell print:table-cell">{t('plant_list.columns.latin_name')}</Th>
                <Th className="text-right">{t('plant_list.columns.isolated')}</Th>
                <Th className="text-right">{t('plant_list.columns.composed')}</Th>
                <Th className="text-right">{t('plant_list.columns.total')}</Th>
                <Th className="hidden text-right md:table-cell print:table-cell">{t('plant_list.columns.spread_m')}</Th>
                <Th className="w-8 print:table-cell"><span className="sr-only">✓</span></Th>
              </tr>
            </thead>
            {groups.map(({ strata, rows }) => (
              <tbody key={strata} className="break-inside-avoid">
                <tr>
                  <td colSpan={7} className="pb-1 pt-4 text-xs font-semibold uppercase tracking-wide text-loam-600">
                    <span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: STRATA_COLORS[strata] }} />
                    {strataLabel(strata)}
                  </td>
                </tr>
                {rows.map((row) => (
                  <tr key={`${row.speciesId}-${row.varietyId ?? ''}`} className="border-b border-loam-100">
                    <td className="py-1.5 pr-2">
                      {row.commonName ?? row.latinName}{row.varietyName ? ` '${row.varietyName}'` : ''}
                      <span className="block text-xs italic text-loam-500 sm:hidden print:hidden">{row.latinName}</span>
                    </td>
                    <td className="hidden py-1.5 pr-2 italic text-loam-600 sm:table-cell print:table-cell">{row.latinName}</td>
                    <td className="py-1.5 text-right tabular-nums">{row.isolated || '—'}</td>
                    <td className="py-1.5 text-right tabular-nums">{row.composed || '—'}</td>
                    <td className="py-1.5 text-right font-semibold tabular-nums">{row.total}</td>
                    <td className="hidden py-1.5 text-right tabular-nums text-loam-600 md:table-cell print:table-cell">{formatDecimal(row.spreadM)}</td>
                    <td className="py-1.5 text-center"><span className="inline-block h-3.5 w-3.5 rounded-sm border border-loam-400" /></td>
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        )}

        {alerts.alerts.length > 0 && (
          <section className="mt-8 break-inside-avoid">
            <h2 className="text-base">{t('plant_list.coherence')}</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-loam-700">
              {alerts.alerts.map((alert, i) => (
                <li key={i}><span className="font-medium">{t(`plant_alerts.rules.${alert.rule}`)} :</span> {alert.message}</li>
              ))}
            </ul>
          </section>
        )}

        <footer className="mt-8 border-t border-loam-200 pt-3 text-xs text-loam-500">{t('plant_list.print_page.footer')}</footer>
      </div>
    </div>
  )
}

// No app chrome on paper: a layout resolver returning null renders the page alone.
PlantListPrint.layout = () => null

function Th({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <th className={'py-2 pr-2 font-medium ' + className}>{children}</th>
}
