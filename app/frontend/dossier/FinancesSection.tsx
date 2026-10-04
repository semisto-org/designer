import { formatMoney, formatQuantity } from '@/components/finances/format'
import { t } from '@/lib/i18n'
import { Facts, Indicative, Muted, Section, SubTitle } from '@/dossier/parts'
import type { Dossier } from '@/types/dossier'

/** The key figures of the 20-year financial plan, when one exists. */
export function FinancesSection({ dossier, number }: { dossier: Dossier; number: number }) {
  const finances = dossier.finances
  return (
    <Section id="finances" number={number} title={t('dossier.sections.finances')}>
      {!finances.exists ? (
        <Muted>{t('dossier.finances.none')}</Muted>
      ) : (
        <FinanceFigures summary={finances.summary} />
      )}
    </Section>
  )
}

function FinanceFigures({ summary: s }: { summary: Extract<Dossier['finances'], { exists: true }>['summary'] }) {
  const year = (value: number | null): [string, string?] =>
    value == null ? [t('finances.kpis.never')] : [String(s.startYear + value - 1), t('finances.kpis.plan_year', { year: value })]
  const [breakEven, breakEvenHint] = year(s.breakEvenYear)
  const [payback, paybackHint] = year(s.paybackYear)
  return (
    <div className="dossier-keep space-y-4">
      <p className="text-xs text-loam-500">{t('dossier.finances.intro')}</p>
      <SubTitle>{t('finances.page.disclaimer_title')}<Indicative /></SubTitle>
      <Facts
        columns={3}
        items={[
          [t('finances.kpis.total_investment'), formatMoney(s.totalInvestment)],
          [t('finances.kpis.funding_need'), formatMoney(s.fundingNeed)],
          [t('finances.kpis.final_cash'), formatMoney(s.finalCash)],
          [t('finances.kpis.break_even_year'), breakEven, breakEvenHint],
          [t('finances.kpis.payback_year'), payback, paybackHint],
          [t('finances.kpis.peak_hours'), formatQuantity(s.peakPickingHours, 'h')],
          [t('dossier.finances.species'), String(s.speciesCount)],
        ]}
      />
      {s.warningsCount > 0 && <p className="text-sm text-humus-800">{t('dossier.finances.warnings', { count: s.warningsCount })}</p>}
      <p className="text-xs text-loam-500">{t('finances.export.disclaimer')}</p>
    </div>
  )
}
