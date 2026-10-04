import { formatDelta, formatMm, formatMonthDay, formatPct, formatTemp } from '@/components/climate/format'
import { t } from '@/lib/i18n'
import { Facts, Indicative, LockedNote, Muted, Section, SubTitle, Table, Td, Th } from '@/dossier/parts'
import type { Horizon, PlantStatus, Scenario } from '@/types/climate_finance'
import type { Dossier } from '@/types/dossier'

const HORIZONS: Horizon[] = ['2050', '2080']
const SCENARIOS: Scenario[] = ['moderate', 'high']
const STATUSES: PlantStatus[] = ['ok', 'borderline', 'at_risk', 'unknown']

/** Today's normals and zone, the zones of 2050 and 2080, the plants against them. */
export function ClimateSection({ dossier, number, isOwner }: { dossier: Dossier; number: number; isOwner: boolean }) {
  const { current, projections, plants } = dossier.climate
  const locked = 'locked' in projections
  return (
    <Section id="climate" number={number} title={t('dossier.sections.climate')}>
      <div className="dossier-keep space-y-2">
        <SubTitle>{t('dossier.climate.today')}<Indicative /></SubTitle>
        {current.available ? (
          <>
            {current.zone && (
              <p className="text-base">
                <span className="font-semibold text-loam-900">{t('dossier.climate.zone', { code: current.zone.code })}</span>
                <span className="text-loam-600"> · {t('dossier.climate.coldest_night', { temp: formatTemp(current.normals.extremeMinC) })}</span>
              </p>
            )}
            <Facts
              columns={4}
              items={[
                [t('climate.current.normals.mean_temp'), formatTemp(current.normals.meanTempC)],
                [t('climate.current.normals.annual_precip'), formatMm(current.normals.annualPrecipMm)],
                [t('climate.current.normals.frost_days'), current.normals.frostDays == null ? '' : t('climate.current.days', { count: current.normals.frostDays })],
                [t('climate.current.normals.frost_free_days'), current.normals.frostFreeDays == null ? '' : t('climate.current.days', { count: current.normals.frostFreeDays })],
                [t('climate.current.normals.last_spring_frost'), current.normals.lastSpringFrost ? t('climate.current.around', { date: formatMonthDay(current.normals.lastSpringFrost) }) : ''],
                [t('climate.current.normals.first_autumn_frost'), current.normals.firstAutumnFrost ? t('climate.current.around', { date: formatMonthDay(current.normals.firstAutumnFrost) }) : ''],
                [t('climate.current.normals.summer_mean_temp'), formatTemp(current.normals.summerMeanTempC)],
                [t('climate.current.normals.winter_mean_temp'), formatTemp(current.normals.winterMeanTempC)],
              ]}
            />
            <p className="text-xs text-loam-500">
              {t('climate.current.sub_area')}{'\u00a0: '}{current.subArea.name}
              {current.referencePeriod && <> · {t('climate.current.reference', { period: current.referencePeriod })}</>}
            </p>
          </>
        ) : (
          <Muted>{t(`climate.reasons.${current.reason}`)}</Muted>
        )}
      </div>

      <div className={locked ? 'space-y-2 print:hidden' : 'space-y-2'}>
        <SubTitle>{t('dossier.climate.tomorrow')}<Indicative /></SubTitle>
        {locked ? (
          <LockedNote body={t('dossier.locked.climate')} isOwner={isOwner} />
        ) : !projections.available ? (
          <Muted>{t(`climate.reasons.${projections.reason}`)}</Muted>
        ) : (
          <div className="dossier-keep">
            <Table
              head={<>
                <Th>{t('dossier.climate.horizon')}</Th>
                <Th>{t('dossier.climate.scenario')}</Th>
                <Th>{t('dossier.climate.zone_column')}</Th>
                <Th>{t('dossier.climate.coldest_column')}</Th>
                <Th className="hidden sm:table-cell print:table-cell">{t('dossier.climate.mean_column')}</Th>
                <Th>{t('dossier.climate.summer_column')}</Th>
              </>}
            >
              <tbody>
                {HORIZONS.flatMap((horizon) => SCENARIOS.map((scenario) => {
                  const data = projections.horizons[horizon]?.[scenario]
                  if (!data || !data.available) return null
                  return (
                    <tr key={`${horizon}-${scenario}`} className="border-b border-loam-100">
                      <Td className="whitespace-nowrap font-medium text-loam-900">{data.period ?? horizon}</Td>
                      <Td>{t(`climate.future.scenarios.${scenario}`)}{data.ipcc && <span className="text-loam-500"> ({data.ipcc})</span>}</Td>
                      <Td className="font-semibold text-loam-900">{data.zone.code}</Td>
                      <Td className="tabular-nums">{formatTemp(data.extremeMinC)}</Td>
                      <Td className="hidden tabular-nums sm:table-cell print:table-cell">{formatTemp(data.meanTempC)}</Td>
                      <Td className="tabular-nums">{t('dossier.climate.summer_value', { delta: formatDelta(data.deltas.summerTempC[1]), precip: formatPct(data.deltas.summerPrecipPct[1]) })}</Td>
                    </tr>
                  )
                }))}
              </tbody>
            </Table>
            <p className="mt-2 text-xs text-loam-500">{t('climate.sources.method')}</p>
          </div>
        )}
      </div>

      {!locked && 'available' in plants && plants.available && plants.count > 0 && (
        <div className="dossier-keep space-y-2">
          <SubTitle>{t('dossier.climate.plants_title')}<Indicative /></SubTitle>
          <p className="text-xs text-loam-500">{t('dossier.climate.plants_intro')}</p>
          <Table
            head={<>
              <Th />
              {STATUSES.map((status) => <Th key={status} className="text-right">{t(`climate.plants.statuses.${status}`)}</Th>)}
            </>}
          >
            <tbody>
              {[
                { key: 'today', label: t('dossier.climate.plants_today'), tally: plants.summary.today },
                ...HORIZONS.flatMap((horizon) => SCENARIOS.map((scenario) => ({
                  key: `${horizon}-${scenario}`,
                  label: `${horizon} · ${t(`climate.future.scenarios.${scenario}`)}`,
                  tally: plants.summary.future[horizon]?.[scenario] ?? {},
                }))),
              ].map((row) => (
                <tr key={row.key} className="border-b border-loam-100">
                  <Td className="text-loam-800">{row.label}</Td>
                  {STATUSES.map((status) => <Td key={status} className="text-right tabular-nums">{row.tally[status] ?? '—'}</Td>)}
                </tr>
              ))}
            </tbody>
          </Table>
          <AtRisk plants={plants} />
          <p className="text-xs text-loam-500">{t('climate.plants.checks_note')}</p>
        </div>
      )}
    </Section>
  )
}

function AtRisk({ plants }: { plants: Extract<Dossier['climate']['plants'], { items: unknown }> }) {
  const names = plants.items
    .filter((item) => item.today.status === 'at_risk' || item.future['2080']?.high?.status === 'at_risk')
    .map((item) => item.name)
  if (names.length === 0) return null
  return <p className="text-sm text-loam-700">{t('dossier.climate.at_risk', { names: names.join(', ') })}</p>
}
