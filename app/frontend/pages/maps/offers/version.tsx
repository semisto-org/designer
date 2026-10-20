import { Head, Link } from '@inertiajs/react'
import { ArrowLeft, Printer } from 'lucide-react'
import { phaseLabel, PhaseMark, euros, lineLabel } from '@/components/offers/shared'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { formatArea, formatLength, formatNumber, t } from '@/lib/i18n'
import type { OfferTerms, OfferVersionPageProps } from '@/types/offers'

const dateFormat = new Intl.DateTimeFormat('fr-BE', { day: 'numeric', month: 'long', year: 'numeric' })

/**
 * A saved version as the client will read it: the budget phase by phase,
 * plants and supplies, co-management, the total, how it is billed and what
 * the price covers. Frozen: it shows the version's own numbers, whatever
 * the map has become since. Printable.
 */
export default function OfferVersion({ map, version, issuer, letterhead }: OfferVersionPageProps) {
  const { result, inputs, measures } = version
  const settings = inputs.settings
  const vatServices = settings.vat_services_pct
  const regieHtva = settings.hourly_rate
  const plants = result.plants
  const servicesTotal = result.phases.reduce((sum, phase) => sum + phase.price_tvac, 0)
  const scope = measures.scope.filter((item) => !item.missing)
  // Work that only comes with an extension (the pond, its supplies…): the client sees it before agreeing to it.
  const optionLines = result.phases.flatMap((phase) => [...phase.lines, ...phase.expenses].filter((line) => line.option && !line.disabled).map((line) => ({ line, phase: phase.key })))
  const recipient = [measures.lead_name, map.address].filter(Boolean).join(' · ')
  const rates = { rate: euros(regieHtva), rate_tvac: euros(result.regie_rate_tvac) }
  // The markup on the fees is named by the account's price scale, or not at all.
  const markupLabel = version.terms.markup_label?.trim()
  const feesDetail = markupLabel ? t('offers.version_page.fees_detail_markup', { label: markupLabel }) : t('offers.version_page.fees_detail')

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Head title={t('offers.version_page.title', { label: version.label })} />
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Link href={`/maps/${map.id}/offer`} className="inline-flex items-center gap-1 text-sm text-loam-500 hover:text-loam-900 print:hidden">
            <ArrowLeft className="h-4 w-4" />{t('offers.version_page.back')}
          </Link>
          <div className="mt-3 flex items-center gap-3">
            {letterhead && <img src={letterhead.logoUrl} alt="" className="max-h-12 max-w-[10rem] object-contain object-left" />}
            <p className="font-medium text-loam-800">{t('offers.version_page.issuer', { name: issuer })}</p>
          </div>
          <h1 className="mt-3 text-2xl">{t('offers.version_page.title', { label: version.label })}</h1>
          {recipient && <p className="text-loam-700">{t('offers.version_page.recipient', { recipient })}</p>}
          <p className="text-loam-500">{t('offers.version_page.subtitle', { map: map.name, date: dateFormat.format(new Date(version.createdAt)) })}</p>
        </div>
        <Button variant="ghost" size="sm" className="print:hidden" onClick={() => window.print()}><Printer className="h-4 w-4" />{t('offers.page.print')}</Button>
      </header>

      <Card className="space-y-5 print:shadow-none print:ring-0">
        <h2 className="font-serif text-xl font-semibold text-prune-800">{t('offers.version_page.budget_title')}</h2>
        {result.phases.map((phase) => (
          <section key={phase.key} className="space-y-1.5">
            <h3 className="flex items-baseline justify-between gap-2 font-semibold text-loam-900">
              <span><PhaseMark phase={phase.key} /> {phaseLabel(phase.key)}</span>
              <span className="tabular-nums">{euros(phase.price_tvac)}</span>
            </h3>
            <Row label={t('offers.version_page.fees')} hint={feesDetail} value={phase.prices.fees} />
            {phase.prices.expenses > 0 && <Row label={t('offers.version_page.expenses')} value={phase.prices.expenses} />}
          </section>
        ))}
        <Row strong label={t('offers.version_page.subtotal_services')} hint={t('offers.version_page.vat', { pct: vatServices })} value={servicesTotal} />

        {plants.count_base > 0 && (
          <section className="space-y-1.5 border-t border-loam-100 pt-4">
            <Row label={t('offers.version_page.plants', { count: formatNumber(plants.count_base) })} hint={t('offers.version_page.vat', { pct: settings.vat_plants_pct })} value={plants.plants_base_tvac} />
            <Row label={t('offers.version_page.supplies')} hint={t('offers.version_page.vat', { pct: settings.vat_supplies_pct })} value={plants.supplies_base_tvac} />
            <p className="text-sm text-loam-600">{t('offers.version_page.plants_note')}</p>
          </section>
        )}

        <div className="flex items-baseline justify-between gap-2 border-t border-prune-200 pt-3">
          <span className="font-semibold text-prune-900">{t('offers.version_page.total')}</span>
          <span className="font-serif text-2xl font-semibold tabular-nums text-prune-900">{euros(result.totals.total_tvac)}</span>
        </div>
        {result.totals.total_max_tvac > result.totals.total_tvac && (
          <p className="text-sm text-loam-700">{t('offers.version_page.total_max', { amount: euros(result.totals.total_max_tvac) })}</p>
        )}

        {result.totals.design_share_pct != null && (
          <section className="space-y-1.5">
            <div className="flex h-2.5 overflow-hidden rounded-full bg-leaf-300" aria-hidden>
              <div className="bg-prune-500" style={{ width: `${Math.min(result.totals.design_share_pct, 100)}%` }} />
            </div>
            <p className="text-sm text-loam-700">
              {t('offers.version_page.share', { design: euros(result.totals.design_tvac), share: Math.round(result.totals.design_share_pct), implementation: euros(result.totals.implementation_tvac) })}
            </p>
            {result.totals.saved_tvac > 0 && <p className="text-xs text-loam-500">{t('offers.version_page.saved', { amount: euros(result.totals.saved_tvac) })}</p>}
          </section>
        )}

        <section className="space-y-1 text-sm text-loam-700">
          <h3 className="font-semibold text-loam-900">{t('offers.version_page.co_management')}</h3>
          <p>{t('offers.version_page.co_management_text', { ...rates, half_days: result.co_management.half_days })}</p>
        </section>
      </Card>

      <Card className="space-y-4 text-sm text-loam-700 print:shadow-none print:ring-0">
        <section>
          <h3 className="font-semibold text-loam-900">{t('offers.version_page.scope_title')}</h3>
          <ul className="mt-1 space-y-1">
            {scope.map((item) => (
              <li key={item.id} className="flex justify-between gap-2">
                <span>
                  {t(`offers.planting_types.${item.planting_type}`)}
                  {/* Versions saved before the default label was dropped still carry it: it says nothing to the client. */}
                  {item.label && item.label !== t('offers.scope.manual_label') && <span className="text-loam-500"> · {item.label}</span>}
                  {item.option && <span className="text-loam-500"> · {t('offers.version_page.scope_option')}</span>}
                </span>
                <span className="tabular-nums text-loam-500">
                  {item.measure_kind === 'area' ? formatArea(item.measure) : formatLength(item.measure)}
                  {item.plants_total > 0 && ` · ${formatNumber(item.plants_total)} ${t('offers.scope.plants').toLowerCase()}`}
                </span>
              </li>
            ))}
          </ul>
          {optionLines.length > 0 && (
            <>
              <p className="mt-3 font-medium text-loam-800">{t('offers.version_page.option_work')}</p>
              <ul className="mt-1 space-y-1">
                {optionLines.map(({ line, phase }) => (
                  <li key={line.key}>{lineLabel(line)} <span className="text-loam-500">· {phaseLabel(phase)}</span></li>
                ))}
              </ul>
            </>
          )}
        </section>
        <section>
          <h3 className="font-semibold text-loam-900">{t('offers.version_page.billing_title')}</h3>
          <p>{t('offers.version_page.billing')}</p>
        </section>
        <section>
          <h3 className="font-semibold text-loam-900">{t('offers.version_page.regie_title')}</h3>
          <p>{t('offers.version_page.regie', rates)}</p>
        </section>
        <Terms terms={version.terms} />
      </Card>

      <details className="rounded-2xl bg-loam-50 p-4 text-sm ring-1 ring-inset ring-loam-200 print:hidden">
        <summary className="cursor-pointer font-medium text-loam-800">{t('offers.version_page.internal_title')}</summary>
        <ul className="mt-2 space-y-1 text-loam-700">
          {result.phases.map((phase) => (
            <li key={phase.key} className="flex justify-between gap-2">
              <span>{phaseLabel(phase.key)} · {formatNumber(phase.hours_min)} h → {formatNumber(phase.hours_max)} h</span>
              <span className="tabular-nums">{euros(phase.total_min)} → {euros(phase.total_max)} HTVA</span>
            </li>
          ))}
        </ul>
        {inputs.notes && <p className="mt-2 whitespace-pre-line text-loam-600">{inputs.notes}</p>}
      </details>
    </div>
  )
}

function Row({ label, hint, value, strong }: { label: string; hint?: string; value: number; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className={strong ? 'font-semibold text-loam-900' : 'text-loam-700'}>
        {label}{hint && <span className="block text-xs text-loam-500">{hint}</span>}
      </span>
      <span className={strong ? 'font-semibold tabular-nums' : 'tabular-nums'}>{euros(value)}</span>
    </div>
  )
}

/** What keeps the work within its price: rounds of changes, validity, deposit, assumptions, exclusions. */
function Terms({ terms }: { terms: OfferTerms }) {
  const facts = [
    terms.revisions != null && t('offers.version_page.revisions', { count: terms.revisions }),
    terms.validity_days != null && t('offers.version_page.validity', { days: terms.validity_days }),
    terms.deposit_pct != null && terms.deposit_pct > 0 && t('offers.version_page.deposit', { pct: terms.deposit_pct }),
  ].filter(Boolean) as string[]
  if (facts.length === 0 && !terms.assumptions && !terms.exclusions) return null
  return (
    <section className="space-y-2">
      <h3 className="font-semibold text-loam-900">{t('offers.version_page.terms_title')}</h3>
      {facts.length > 0 && <ul className="list-disc space-y-0.5 pl-5">{facts.map((fact) => <li key={fact}>{fact}</li>)}</ul>}
      {terms.assumptions && <p className="whitespace-pre-line"><strong className="font-medium">{t('offers.version_page.assumptions')}</strong> {terms.assumptions}</p>}
      {terms.exclusions && <p className="whitespace-pre-line"><strong className="font-medium">{t('offers.version_page.exclusions')}</strong> {terms.exclusions}</p>}
    </section>
  )
}
