import { Link } from '@inertiajs/react'
import { ArrowRight } from 'lucide-react'
import { useEffect, useState } from 'react'
import { buttonClass } from '@/components/ui/Button'
import { formatMoney } from '@/components/finances/format'
import { api } from '@/lib/api'
import { t } from '@/lib/i18n'
import { useEditor } from '@/map/editor/EditorContext'
import type { FinanceSummary } from '@/types/climate_finance'

/** "Finances": the key figures of the map's financial plan, and a way in. */
export default function FinancesPanel() {
  const editor = useEditor()
  const [data, setData] = useState<FinanceSummary | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    api<FinanceSummary>(`/maps/${editor.map.id}/finances`, { signal: controller.signal }).then(setData).catch(() => setData(null))
    return () => controller.abort()
  }, [editor.map.id])

  const s = data?.summary
  const year = (value: number | null) =>
    value == null || !s ? t('finances.kpis.never') : String(s.startYear + value - 1)

  return (
    <div className="space-y-4">
      <p className="text-sm text-loam-600">{t('finances.panel.intro')}</p>
      {data && !data.plan.persisted && <p className="text-xs text-loam-500">{t('finances.panel.not_started')}</p>}
      {s && data?.plan.persisted && (
        <dl className="grid grid-cols-2 gap-2 text-sm">
          <Kpi label={t('finances.kpis.total_investment')} value={formatMoney(s.totalInvestment)} />
          <Kpi label={t('finances.kpis.break_even_year')} value={year(s.breakEvenYear)} />
          <Kpi label={t('finances.kpis.funding_need')} value={formatMoney(s.fundingNeed)} />
          <Kpi label={t('finances.kpis.final_cash')} value={formatMoney(s.finalCash)} />
        </dl>
      )}
      {s && s.warningsCount > 0 && data?.plan.persisted && (
        <p className="text-xs text-humus-700">{t('finances.panel.warnings', { count: s.warningsCount })}</p>
      )}
      <Link href={`/maps/${editor.map.id}/finances`} className={buttonClass('primary', 'md', 'w-full')}>
        {t('finances.panel.open')}
        <ArrowRight className="h-4 w-4" />
      </Link>
      <p className="text-[11px] text-loam-500">{t('finances.page.disclaimer_title')}.</p>
    </div>
  )
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-loam-50 px-2.5 py-2">
      <dt className="text-[11px] leading-tight text-loam-500">{label}</dt>
      <dd className="font-medium text-loam-900">{value}</dd>
    </div>
  )
}
