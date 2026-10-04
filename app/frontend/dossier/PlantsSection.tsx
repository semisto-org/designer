import { formatDecimal, strataLabel } from '@/components/plants/format'
import { sourceLabel } from '@/components/plants/ProvenanceBadge'
import { formatNumber, t } from '@/lib/i18n'
import { STRATA_COLORS } from '@/map/plants/strata'
import { Muted, Section, Table, Td, Th } from '@/dossier/parts'
import type { Dossier, SpreadSource } from '@/types/dossier'
import { STRATA } from '@/types/plants'

function sourceText(source: SpreadSource | null): string | null {
  if (!source) return null
  if (source === 'strata_default') return t('dossier.plants.source_default')
  if (source === 'catalogue') return t('dossier.plants.source_catalogue')
  return sourceLabel(source)
}

/** What to order and plant, by strata, with totals; every spread cites its source. */
export function PlantsSection({ dossier, number }: { dossier: Dossier; number: number }) {
  const list = dossier.plants
  const groups = STRATA.map((strata) => ({ strata, rows: list.rows.filter((r) => r.strata === strata) })).filter((g) => g.rows.length)
  return (
    <Section
      id="plants"
      number={number}
      title={t('dossier.sections.plants')}
      intro={list.rows.length > 0 && <>{t('dossier.plants.intro')}{list.hardinessZone != null && <> {t('dossier.plants.zone', { zone: list.hardinessZone })}</>}</>}
    >
      {list.rows.length === 0 ? (
        <Muted>{t('dossier.plants.empty')}</Muted>
      ) : (
        <>
          <p className="text-base font-semibold text-loam-900">{t('dossier.plants.totals', { total: formatNumber(list.total), species: list.speciesCount })}</p>
          <Table
            head={<>
              <Th>{t('dossier.plants.name')}</Th>
              <Th className="hidden sm:table-cell print:table-cell">{t('dossier.plants.latin')}</Th>
              <Th className="text-right">{t('dossier.plants.quantity')}</Th>
              <Th className="text-right">{t('dossier.plants.spread')}</Th>
            </>}
          >
            {groups.map(({ strata, rows }) => (
              <tbody key={strata}>
                <tr className="dossier-keep-next">
                  <td colSpan={2} className="pb-1 pt-4 text-xs font-semibold uppercase tracking-wide text-loam-600">
                    <span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: STRATA_COLORS[strata] }} aria-hidden />
                    {strataLabel(strata)}
                  </td>
                  <td colSpan={2} className="pb-1 pt-4 text-right text-xs text-loam-500">
                    {t('dossier.plants.strata_total', { count: rows.reduce((sum, r) => sum + r.total, 0) })}
                  </td>
                </tr>
                {rows.map((row) => {
                  const source = sourceText(row.spreadSource)
                  return (
                    <tr key={`${row.speciesId}-${row.varietyId ?? ''}`} className="border-b border-loam-100 break-inside-avoid">
                      <Td>
                        {row.commonName ?? row.latinName}{row.varietyName ? ` '${row.varietyName}'` : ''}
                        <span className="block text-xs italic text-loam-500 sm:hidden print:hidden">{row.latinName}</span>
                      </Td>
                      <Td className="hidden italic text-loam-600 sm:table-cell print:table-cell">{row.latinName}</Td>
                      <Td className="text-right font-semibold tabular-nums text-loam-900">{formatNumber(row.total)}</Td>
                      <Td className="whitespace-nowrap text-right tabular-nums">
                        {formatDecimal(row.spreadM)} m
                        {source && <span className="block text-[10px] uppercase tracking-wide text-loam-400">{source}</span>}
                      </Td>
                    </tr>
                  )
                })}
              </tbody>
            ))}
          </Table>
          {list.unlinked > 0 && <p className="text-xs text-loam-500">{t('dossier.plants.unlinked', { count: list.unlinked })}</p>}
        </>
      )}
    </Section>
  )
}
