import { Head, Link } from '@inertiajs/react'
import clsx from 'clsx'
import { ArrowLeft, FileText, Printer } from 'lucide-react'
import type { ReactNode } from 'react'
import { Prose } from '@/components/help/Prose'
import { phaseLabel, PhaseMark, euros, lineLabel } from '@/components/offers/shared'
import { Button, buttonClass } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { formatArea, formatLength, formatNumber, t } from '@/lib/i18n'
import type { ClientSection, DocumentStep, OfferTerms, OfferVersionPageProps } from '@/types/offers'

const dateFormat = new Intl.DateTimeFormat('fr-BE', { day: 'numeric', month: 'long', year: 'numeric' })

/**
 * The client document of an offer: a saved version, or the working offer
 * in preview. Its blocks come from the account's price scale and the
 * offer (Offer::ClientDocument): cover, letter, approach, scope, one page
 * per phase, co-management, the software, deliverables, the budget and a
 * conclusion. A saved version is frozen: it shows its own numbers,
 * whatever the map has become since. Printed (or saved as PDF) one block
 * per page; also downloadable as a Word file.
 */
export default function OfferVersion(props: OfferVersionPageProps) {
  const { map, version, document, preview } = props
  const docxUrl = preview ? `/maps/${map.id}/offer/preview.docx` : `/maps/${map.id}/offer/versions/${version.number}.docx`

  return (
    <div className="offer-document mx-auto max-w-3xl space-y-6">
      <Head title={t('offers.version_page.title', { label: version.label })} />
      <header className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={`/maps/${map.id}/offer`} className="inline-flex items-center gap-1 text-sm text-loam-500 hover:text-loam-900">
          <ArrowLeft className="h-4 w-4" />{t('offers.version_page.back')}
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" title={t('offers.document.pdf_hint')} onClick={() => window.print()}>
            <Printer className="h-4 w-4" aria-hidden />{t('offers.document.download_pdf')}
          </Button>
          {/* A file, not a page: a plain link, outside Inertia. */}
          <a href={docxUrl} download className={buttonClass('secondary', 'sm')}>
            <FileText className="h-4 w-4" aria-hidden />{t('offers.document.download_word')}
          </a>
        </div>
      </header>
      {preview && (
        <p className="rounded-xl bg-humus-50 p-3 text-sm text-humus-900 ring-1 ring-inset ring-humus-200 print:hidden">{t('offers.document.preview_banner')}</p>
      )}

      {document.sections.map((section, index) => (
        <Page key={section.key} first={index === 0}>
          <Section section={section} {...props} />
        </Page>
      ))}

      <InternalDetails {...props} />
    </div>
  )
}

/** One block: a card on screen, a page on paper. */
function Page({ first, children }: { first: boolean; children: ReactNode }) {
  return (
    <Card className={clsx('space-y-4 print:p-0 print:shadow-none print:ring-0', !first && 'print:break-before-page')}>
      {children}
    </Card>
  )
}

function Section({ section, ...props }: OfferVersionPageProps & { section: ClientSection }) {
  switch (section.key) {
    case 'cover': return <Cover section={section} {...props} />
    case 'scope': return <Scope section={section} {...props} />
    case 'budget': return <Budget section={section} {...props} />
    case 'phases': return <Phases section={section} />
    case 'co_management':
      return (
        <>
          <Title><span className="text-leaf-700">{t('offers.co_management.number')}</span> {section.title}</Title>
          <Text html={section.html} />
        </>
      )
    case 'letter':
      return (
        <>
          <Title>{section.title}</Title>
          <Text html={section.html} />
          <Text html={section.closingHtml} />
        </>
      )
    default:
      return (
        <>
          <Title>{section.title}</Title>
          <Text html={section.html} />
          {section.phases && <Steps steps={section.phases} />}
        </>
      )
  }
}

function Title({ children }: { children: ReactNode }) {
  return <h2 className="font-serif text-2xl font-semibold text-prune-800">{children}</h2>
}

function Text({ html }: { html?: string }) {
  return html ? <Prose html={html} /> : null
}

function StepMark({ step }: { step: DocumentStep }) {
  return step === 'co_management' ? <span className="font-serif text-leaf-700">{t('offers.co_management.number')}</span> : <PhaseMark phase={step} />
}

function stepLabel(step: DocumentStep) {
  return step === 'co_management' ? t('offers.co_management.title') : phaseLabel(step)
}

/** The three steps, or the deliverables step by step. */
function Steps({ steps }: { steps: NonNullable<ClientSection['phases']> }) {
  return (
    <div className="space-y-4">
      {steps.filter((step) => step.html).map((step) => (
        <section key={step.key} className="space-y-1">
          <h3 className="font-semibold text-loam-900"><StepMark step={step.key} /> {stepLabel(step.key)}</h3>
          <Text html={step.html} />
        </section>
      ))}
    </div>
  )
}

/** One page per phase in the offer. */
function Phases({ section }: { section: ClientSection }) {
  return (
    <div className="space-y-8">
      {(section.phases ?? []).map((phase, index) => (
        <section key={phase.key} className={clsx('space-y-3', index > 0 && 'border-t border-loam-100 pt-6 print:break-before-page print:border-0 print:pt-0')}>
          <Title><StepMark step={phase.key} /> {stepLabel(phase.key)}</Title>
          <Text html={phase.html} />
        </section>
      ))}
    </div>
  )
}

function Cover({ section, map, version, issuer, letterhead }: OfferVersionPageProps & { section: ClientSection }) {
  const recipient = [version.measures.lead_name, map.address].filter(Boolean).join(' · ')
  return (
    <div className="space-y-6 py-6 print:flex print:min-h-[85vh] print:flex-col print:justify-center">
      {letterhead && <img src={letterhead.logoUrl} alt="" className="max-h-16 max-w-[12rem] object-contain object-left" />}
      <h1 className="text-4xl text-prune-900">{section.title}</h1>
      <div className="space-y-1">
        <p className="font-medium text-loam-900">{issuer}</p>
        <Text html={section.html} />
      </div>
      <div className="space-y-0.5 text-loam-600">
        {recipient && <p>{t('offers.version_page.recipient', { recipient })}</p>}
        <p>{t('offers.version_page.subtitle', { map: map.name, date: dateFormat.format(new Date(version.createdAt)) })} · {version.label}</p>
      </div>
    </div>
  )
}

function Scope({ section, version }: OfferVersionPageProps & { section: ClientSection }) {
  const scope = version.measures.scope.filter((item) => !item.missing)
  const [base, options] = [scope.filter((item) => !item.option), scope.filter((item) => item.option)]
  const phases = version.result.phases.filter((phase) => phase.enabled !== false)
  // Work that only comes with an extension (the pond, its supplies…): the client sees it before agreeing to it.
  const optionLines = phases.flatMap((phase) => [...phase.lines, ...phase.expenses].filter((line) => line.option && !line.disabled).map((line) => ({ line, phase: phase.key })))
  const item = (entry: (typeof scope)[number]) => (
    <li key={entry.id} className="flex justify-between gap-2">
      <span>
        {t(`offers.planting_types.${entry.planting_type}`)}
        {/* Versions saved before the default label was dropped still carry it: it says nothing to the client. */}
        {entry.label && entry.label !== t('offers.scope.manual_label') && <span className="text-loam-500"> · {entry.label}</span>}
      </span>
      <span className="tabular-nums text-loam-500">
        {entry.measure_kind === 'area' ? formatArea(entry.measure) : formatLength(entry.measure)}
        {entry.plants_total > 0 && ` · ${formatNumber(entry.plants_total)} ${t('offers.scope.plants').toLowerCase()}`}
      </span>
    </li>
  )
  return (
    <>
      <Title>{section.title}</Title>
      <Text html={section.html} />
      <ul className="space-y-1 text-loam-800">{base.map(item)}</ul>
      {options.length > 0 && (
        <>
          <p className="font-medium uppercase tracking-wide text-sm text-leaf-700">{t('offers.document.scope_options')}</p>
          <ul className="space-y-1 text-loam-800">{options.map(item)}</ul>
        </>
      )}
      {optionLines.length > 0 && (
        <>
          <p className="font-medium text-loam-800">{t('offers.version_page.option_work')}</p>
          <ul className="space-y-1 text-sm text-loam-700">
            {optionLines.map(({ line, phase }) => (
              <li key={`${phase}-${line.key}`}>{lineLabel(line)} <span className="text-loam-500">· {phaseLabel(phase)}</span></li>
            ))}
          </ul>
        </>
      )}
    </>
  )
}

/** The budget phase by phase, plants and supplies, co-management, the total, how it is billed and what the price covers. */
function Budget({ section, version }: OfferVersionPageProps & { section: ClientSection }) {
  const { result, inputs } = version
  const settings = inputs.settings
  const vatServices = settings.vat_services_pct
  const plants = result.plants
  // Phases the team left out of the offer are not the client's business.
  const phases = result.phases.filter((phase) => phase.enabled !== false)
  const servicesTotal = phases.reduce((sum, phase) => sum + phase.price_tvac, 0)
  const coManagement = result.co_management
  const planting = result.totals.planting_included !== false
  const rates = { rate: euros(settings.hourly_rate), rate_tvac: euros(result.regie_rate_tvac) }
  // The markup on the fees is named by the account's price scale, or not at all.
  const markupLabel = version.terms.markup_label?.trim()
  const feesDetail = markupLabel ? t('offers.version_page.fees_detail_markup', { label: markupLabel }) : t('offers.version_page.fees_detail')

  return (
    <>
      <Title>{section.title}</Title>
      <div className="space-y-5">
        {phases.map((phase) => (
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

        {planting && plants.count_base > 0 && (
          <section className="space-y-1.5 border-t border-loam-100 pt-4">
            <Row label={t('offers.version_page.plants', { count: formatNumber(plants.count_base) })} hint={t('offers.version_page.vat', { pct: settings.vat_plants_pct })} value={plants.plants_base_tvac} />
            <Row label={t('offers.version_page.supplies')} hint={t('offers.version_page.vat', { pct: settings.vat_supplies_pct })} value={plants.supplies_base_tvac} />
          </section>
        )}

        {coManagement.enabled && coManagement.years && (
          <section className="space-y-1.5 border-t border-loam-100 pt-4">
            <h3 className="flex items-baseline justify-between gap-2 font-semibold text-loam-900">
              <span><span className="font-serif text-leaf-700">{t('offers.co_management.number')}</span> {t('offers.co_management.title')}</span>
              <span className="tabular-nums">{euros(coManagement.amount_tvac)}</span>
            </h3>
            {coManagement.years.map((year) => (
              <Row
                key={year.year}
                label={t('offers.version_page.co_management_year', { year: year.year, half_days: formatNumber(year.half_days) })}
                hint={t('offers.version_page.co_management_year_hint')}
                value={year.amount_tvac}
              />
            ))}
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
          </section>
        )}

        {/* Versions saved before co-management could be offered carry only the yearly estimate. */}
        {coManagement.enabled == null && (
          <section className="space-y-1 text-sm text-loam-700">
            <h3 className="font-semibold text-loam-900">{t('offers.version_page.co_management')}</h3>
            <p>{t('offers.version_page.co_management_text', { ...rates, half_days: coManagement.half_days })}</p>
          </section>
        )}
      </div>

      <Text html={section.html} />
      <div className="space-y-4 border-t border-loam-100 pt-4 text-sm text-loam-700">
        <section>
          <h3 className="font-semibold text-loam-900">{t('offers.version_page.billing_title')}</h3>
          <p>{t('offers.version_page.billing')}</p>
        </section>
        <section>
          <h3 className="font-semibold text-loam-900">{t('offers.version_page.regie_title')}</h3>
          <p>{t('offers.version_page.regie', rates)}</p>
        </section>
        <Terms terms={version.terms} />
      </div>
    </>
  )
}

/** For the team only, never printed: hours and amounts before tax, and the internal notes. */
function InternalDetails({ version }: OfferVersionPageProps) {
  return (
    <details className="rounded-2xl bg-loam-50 p-4 text-sm ring-1 ring-inset ring-loam-200 print:hidden">
      <summary className="cursor-pointer font-medium text-loam-800">{t('offers.version_page.internal_title')}</summary>
      <ul className="mt-2 space-y-1 text-loam-700">
        {version.result.phases.map((phase) => (
          <li key={phase.key} className="flex justify-between gap-2">
            <span>{phaseLabel(phase.key)} · {formatNumber(phase.hours_min)} h → {formatNumber(phase.hours_max)} h</span>
            <span className="tabular-nums">{euros(phase.total_min)} → {euros(phase.total_max)} HTVA</span>
          </li>
        ))}
      </ul>
      {version.inputs.notes && <p className="mt-2 whitespace-pre-line text-loam-600">{version.inputs.notes}</p>}
    </details>
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
