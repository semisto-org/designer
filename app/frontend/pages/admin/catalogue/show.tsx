import { Head } from '@inertiajs/react'
import { AdminNav } from '@/components/admin/AdminNav'
import { Card, EmptyState } from '@/components/ui/Card'
import { t } from '@/lib/i18n'

type Row = { field: string; decidesFit: boolean; sourced: number; toVerify: number; empty: number; usedFilled: number | null }
type ToComplete = { id: number; slug: string; name: string; latinName: string; maps: number; missing: string[] }
type Coverage = { total: number; usedTotal: number; rows: Row[]; toComplete: ToComplete[] }

const percent = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0)

/** Semisto staff: how complete the plant sheets are, where it matters for suggestions. */
export default function AdminCatalogue({ coverage }: { coverage: Coverage }) {
  const { total, usedTotal } = coverage
  return (
    <div>
      <Head title={t('admin.catalogue.title')} />
      <AdminNav />
      <h1 className="text-2xl">{t('admin.catalogue.title')}</h1>
      <p className="mt-1 max-w-3xl text-loam-500">{t('admin.catalogue.intro')}</p>
      <p className="mt-2 text-sm text-loam-600">
        {t('admin.catalogue.total', { count: total })}, {t('admin.catalogue.used_total', { count: usedTotal })}.
      </p>

      <Card className="mt-4 p-0!">
        <ul className="divide-y divide-loam-100">
          {coverage.rows.map((row) => (
            <li key={row.field} className="grid gap-2 px-4 py-3 sm:grid-cols-[14rem_1fr_10rem] sm:items-center">
              <div>
                <p className="font-medium text-loam-900">{t(`plants.fields.${row.field}`)}</p>
                {row.decidesFit && (
                  <p className="text-sm text-prune-700" title={t('admin.catalogue.decides_fit_help')}>{t('admin.catalogue.decides_fit')}</p>
                )}
              </div>
              <div>
                <div className="flex h-3 overflow-hidden rounded-full bg-loam-100" aria-hidden>
                  <div className="bg-leaf-500" style={{ width: `${percent(row.sourced, total)}%` }} />
                  <div className="bg-humus-300" style={{ width: `${percent(row.toVerify, total)}%` }} />
                </div>
                <p className="mt-1 text-sm text-loam-600 tabular-nums">
                  {t('admin.catalogue.sourced')} {percent(row.sourced, total)} % · {t('admin.catalogue.to_verify')} {percent(row.toVerify, total)} % · {t('admin.catalogue.empty')} {percent(row.empty, total)} %
                </p>
              </div>
              <p className="text-sm text-loam-700 tabular-nums sm:text-right sm:whitespace-nowrap" title={t('admin.catalogue.used_filled')}>
                {row.usedFilled === null ? '—' : `${t('admin.catalogue.used_filled_short')} : ${percent(row.usedFilled, usedTotal)} %`}
              </p>
            </li>
          ))}
        </ul>
      </Card>

      <section className="mt-8" aria-labelledby="catalogue-to-complete">
        <h2 id="catalogue-to-complete" className="text-lg">{t('admin.catalogue.to_complete_title')}</h2>
        <p className="mt-1 text-sm text-loam-500">{t('admin.catalogue.to_complete_intro')}</p>
        {coverage.toComplete.length === 0 ? (
          <div className="mt-3"><EmptyState title={t('admin.catalogue.to_complete_empty')} /></div>
        ) : (
          <Card className="mt-3 p-0!">
            <ul className="divide-y divide-loam-100">
              {coverage.toComplete.map((s) => (
                <li key={s.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-2.5">
                  <a href={`/plants/${s.slug}`} className="font-medium text-prune-700 hover:underline">{s.name}</a>
                  <span className="text-sm text-loam-500">{s.latinName} · {t('admin.catalogue.maps', { count: s.maps })}</span>
                  <span className="basis-full text-sm text-loam-600 sm:basis-auto sm:ml-auto">
                    {t('admin.catalogue.missing', { fields: s.missing.map((f) => t(`plants.fields.${f}`).toLowerCase()).join(', ') })}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>
    </div>
  )
}
