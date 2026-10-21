import clsx from 'clsx'
import { Check, ChevronDown, Landmark, Minus } from 'lucide-react'
import { useState } from 'react'
import { CheckoutButton } from '@/components/billing/CheckoutButton'
import { IntervalToggle } from '@/components/billing/IntervalToggle'
import { Faq, type FaqItem } from '@/components/site/Faq'
import { GrowingCrown, PlacesSketch } from '@/components/site/pricing/Sketch'
import { Tape } from '@/components/site/Standouts'
import { ButtonLink, buttonClass } from '@/components/ui/Button'
import { content, tf } from '@/lib/content'
import { t } from '@/lib/i18n'
import { formatPrice } from '@/lib/money'
import type { BillingInterval, CatalogKey, CatalogPlan } from '@/types/billing'

type Row = { label: string; values: string[] }
type PlanCopy = { story: string; unit?: string; lines: string[]; member?: string }
type Mark = { age: number; tag: string; title: string; body: string }
const COLUMNS: CatalogKey[] = ['free', 'yearly', 'atelier', 'bureau']

/**
 * « Tarifs » told in places and years: the first place is free for good,
 * a plan is how many places you design at once, and nothing is ever deleted.
 * The full comparison is an appendix.
 */
export default function Pricing({ catalog, memberPriceCents, contactEmail }: { catalog: CatalogPlan[]; memberPriceCents: number; contactEmail: string }) {
  const [interval, chooseInterval] = useState<BillingInterval>('year')
  const plan = (key: CatalogKey) => catalog.find((p) => p.key === key)!
  const price = (key: CatalogKey) => formatPrice(plan(key).priceCents)
  const yearlyPrice = (key: CatalogKey) => formatPrice(plan(key).yearlyPriceCents ?? 0)
  const launchPrice = (key: CatalogKey) => formatPrice(plan(key).launchPriceCents ?? plan(key).yearlyPriceCents ?? 0)
  const limits = Object.fromEntries(COLUMNS.flatMap((key) => [
    [`${key}_maps`, plan(key).maxMaps ?? 0], [`${key}_storage`, plan(key).storageGb ?? 0], [`${key}_images`, plan(key).renderingsPerMonth ?? 0],
  ]))
  const vars = {
    yearly: price('yearly'), atelier: price('atelier'), bureau: price('bureau'), drone: price('drone'),
    atelier_yearly: yearlyPrice('atelier'), bureau_yearly: yearlyPrice('bureau'),
    atelier_launch: launchPrice('atelier'), bureau_launch: launchPrice('bureau'),
    member: formatPrice(memberPriceCents), email: contactEmail, ...limits,
  }
  const columns = content<Record<string, string>>('site.pricing.compare.columns')
  const rows = content<Row[]>('site.pricing.compare.rows', vars)
  const faq = content<FaqItem[]>('site.pricing.faq.items', vars)
  const marks = content<Mark[]>('site.pricing.years.marks', vars)

  const action = (key: CatalogKey) =>
    key === 'free' ? (
      <ButtonLink href="/session/new" variant="secondary" className="w-full">{tf('site.pricing.cta_free')}</ButtonLink>
    ) : (
      <CheckoutButton plan={key} interval={plan(key).kind === 'subscription' ? interval : undefined} variant={key === 'yearly' ? 'primary' : 'secondary'} className="w-full">
        {tf('site.pricing.cta_choose')}
      </CheckoutButton>
    )

  const priceOf = (key: CatalogKey) => {
    const p = plan(key)
    if (key === 'free') return { amount: formatPrice(0), unit: tf('site.pricing.places.plans.free.unit') }
    if (p.kind === 'subscription' && interval === 'year') return { amount: yearlyPrice(key), unit: tf('site.pricing.places.unit_year') }
    if (p.kind === 'subscription') return { amount: price(key), unit: tf('site.pricing.places.unit_month') }
    return { amount: price(key), unit: tf(`site.pricing.places.plans.${key}.unit`) }
  }

  return (
    <div className="bg-loam-50">
      <header className="mx-auto max-w-6xl px-4 pb-6 pt-14 sm:pt-20">
        <div className="grid items-start gap-10 lg:grid-cols-[1.25fr_1fr]">
          <div>
            <p className="font-hand text-2xl text-leaf-600">{tf('site.pricing.head.kicker')}</p>
            <h1 className="mt-1 text-balance text-4xl font-medium leading-[1.05] text-prune-900 sm:text-6xl">{tf('site.pricing.head.title')}</h1>
            <p className="mt-5 max-w-xl text-pretty text-lg leading-relaxed text-loam-600">{tf('site.pricing.head.lead')}</p>
          </div>
          {/* The promise comes first, not in the FAQ. */}
          <aside className="relative mt-2 rotate-[0.6deg] bg-white px-6 pb-6 pt-7 shadow-[0_1px_0_rgb(43_41_64/0.08),0_24px_40px_-24px_rgb(43_41_64/0.45)] ring-1 ring-loam-900/5">
            <Tape className="-top-3 left-10 -rotate-3" />
            <p className="font-hand text-xl text-prune-600">{tf('site.pricing.promise.kicker')}</p>
            <h2 className="mt-1 font-serif text-2xl font-semibold leading-snug text-prune-900 sm:text-3xl">{tf('site.pricing.promise.title')}</h2>
            <p className="mt-3 text-pretty leading-relaxed text-loam-600">{tf('site.pricing.promise.body')}</p>
          </aside>
        </div>
      </header>

      <section aria-labelledby="places-title" className="mx-auto max-w-6xl px-4 py-14 sm:py-20">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-2xl">
            <h2 id="places-title" className="text-balance font-serif text-3xl font-medium leading-tight text-prune-900 sm:text-4xl">{tf('site.pricing.places.title')}</h2>
            <p className="mt-3 text-pretty text-lg leading-relaxed text-loam-500">{tf('site.pricing.places.intro')}</p>
          </div>
          <div className="flex flex-col items-start gap-1.5 sm:items-end">
            <span className="font-hand text-xl text-prune-600">{tf('site.pricing.places.for_pros')}</span>
            <IntervalToggle value={interval} onChange={chooseInterval} />
          </div>
        </div>

        <ol className="mt-12 grid gap-x-6 gap-y-14 sm:grid-cols-2 lg:grid-cols-4">
          {COLUMNS.map((key, index) => {
            const copy = content<PlanCopy>(`site.pricing.places.plans.${key}`, { ...vars, storage: plan(key).storageGb ?? 0, images: plan(key).renderingsPerMonth ?? 0 })
            const { amount, unit } = priceOf(key)
            const count = plan(key).maxMaps ?? 1
            return (
              <li key={key} className="flex min-w-0 flex-col">
                <div className={clsx('relative bg-white p-2 shadow-[0_1px_0_rgb(43_41_64/0.08),0_20px_36px_-24px_rgb(43_41_64/0.45)] ring-1 ring-loam-900/5', ['-rotate-1', 'rotate-[0.7deg]', '-rotate-[0.5deg]', 'rotate-1'][index])}>
                  <PlacesSketch count={count} className="block aspect-[16/9] w-full bg-loam-50 sm:aspect-[4/3]" />
                  <p className="mt-1.5 px-1 font-hand text-xl leading-tight text-leaf-700">{t('site.pricing.places.count', { count })}</p>
                </div>
                <p className="mt-6 text-sm font-semibold uppercase tracking-[0.12em] text-loam-500">{columns[key]}</p>
                <h3 className="mt-1 text-balance font-serif text-2xl font-medium leading-snug text-prune-900">{copy.story}</h3>
                <p className="mt-3 flex flex-wrap items-baseline gap-x-2">
                  <span className="font-serif text-4xl font-semibold text-prune-900 tabular-nums">{amount}</span>
                  <span className="text-sm text-loam-500">{unit}</span>
                </p>
                {copy.member && <p className="mt-1 font-hand text-lg leading-tight text-leaf-700">{copy.member}</p>}
                <ul className="mt-4 flex-1 space-y-2 border-t border-dashed border-loam-300 pt-4 text-sm leading-relaxed text-loam-600">
                  {copy.lines.map((line) => (
                    <li key={line} className="flex gap-2">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-leaf-600" aria-hidden="true" />
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-6">{action(key)}</div>
              </li>
            )
          })}
        </ol>
      </section>

      <section aria-labelledby="years-title" className="border-y border-loam-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:py-20">
          <div className="max-w-2xl">
            <h2 id="years-title" className="text-balance font-serif text-3xl font-medium leading-tight text-prune-900 sm:text-4xl">{tf('site.pricing.years.title')}</h2>
            <p className="mt-3 text-pretty text-lg leading-relaxed text-loam-500">{tf('site.pricing.years.intro')}</p>
          </div>
          {/* A ruler of thirty years: the plan comes and goes, the place keeps growing. */}
          <ol className="relative mt-12 grid gap-10 md:grid-cols-5 md:gap-6">
            <span aria-hidden="true" className="absolute bottom-0 left-[1.6rem] top-0 w-px bg-prune-900/20 md:inset-x-0 md:bottom-auto md:left-0 md:top-[3.25rem] md:h-px md:w-auto" />
            {marks.map((mark) => (
              <li key={mark.tag} className="relative grid grid-cols-[3.25rem_1fr] gap-4 md:block">
                <GrowingCrown age={mark.age} className="relative h-[6.5rem] w-[3.25rem] bg-white md:h-[6.5rem] md:w-[6.5rem]" />
                <div className="md:mt-3">
                  <p className="font-hand text-xl leading-tight text-leaf-700">{mark.tag}</p>
                  <h3 className="mt-1 font-serif text-xl font-semibold text-prune-900">{mark.title}</h3>
                  <p className="mt-1 text-pretty text-sm leading-relaxed text-loam-600">{mark.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="border-b border-leaf-100 bg-leaf-50">
        <div className="mx-auto grid max-w-6xl items-center gap-8 px-4 py-14 sm:py-16 lg:grid-cols-[1.2fr_1fr]">
          <div>
            <p className="font-hand text-2xl text-leaf-700">{tf('site.pricing.member.eyebrow')}</p>
            <h2 className="mt-1 text-balance font-serif text-2xl font-medium sm:text-3xl">{tf('site.pricing.member.title', vars)}</h2>
            <p className="mt-3 max-w-2xl text-pretty text-lg leading-relaxed text-loam-600">{tf('site.pricing.member.body', vars)}</p>
          </div>
          <div>
            <p className="text-pretty text-loam-500">{tf('site.pricing.member.note')}</p>
            <a href="https://www.semisto.org" className={buttonClass('secondary', 'md', 'mt-4')}>{tf('site.pricing.member.cta')}</a>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14 sm:py-20">
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="flex flex-col items-start gap-4 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-loam-200/70 sm:p-8">
            <h2 className="text-balance font-serif text-xl font-medium sm:text-2xl">{tf('site.pricing.drone.title', vars)}</h2>
            <p className="text-pretty text-loam-500">{tf('site.pricing.drone.body')}</p>
            <ButtonLink href="/mission-drone" variant="secondary" className="mt-auto">{tf('site.pricing.drone.cta')}</ButtonLink>
          </div>
          <div id="facture" className="flex scroll-mt-20 flex-col items-start gap-4 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-loam-200/70 sm:p-8">
            <div className="flex gap-4">
              <Landmark className="mt-1 hidden h-6 w-6 shrink-0 text-leaf-600 sm:block" aria-hidden="true" />
              <div>
                <h2 className="text-balance font-serif text-xl font-medium sm:text-2xl">{tf('invoicing.pricing.title')}</h2>
                <p className="mt-2 text-pretty text-loam-600">{tf('invoicing.pricing.body')}</p>
                <p className="mt-1 text-pretty text-sm text-loam-500">{tf('invoicing.pricing.detail')}</p>
              </div>
            </div>
            {/* Signed out, /billing/invoice sends the visitor through sign-in and back. */}
            <ButtonLink href="/billing/invoice" variant="secondary" className="mt-auto">{tf('invoicing.pricing.cta')}</ButtonLink>
          </div>
        </div>
      </section>

      <section className="border-t border-loam-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:py-20">
          <h2 className="font-serif text-3xl font-medium text-prune-900">{tf('site.pricing.faq.title')}</h2>
          <div className="mt-8 max-w-4xl">
            <Faq items={faq} />
          </div>

          <details className="group mt-16 border-t border-dashed border-loam-300 pt-8">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 [&::-webkit-details-marker]:hidden">
              <span>
                <span className="block font-serif text-2xl font-medium text-prune-900">{tf('site.pricing.annex.title')}</span>
                <span className="mt-1 block text-loam-500">{tf('site.pricing.annex.hint')}</span>
              </span>
              <ChevronDown className="h-5 w-5 shrink-0 text-loam-500 transition-transform group-open:rotate-180" aria-hidden="true" />
            </summary>
            <div className="relative mt-8 overflow-x-auto rounded-xl ring-1 ring-loam-200">
              <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
                <thead>
                  <tr className="bg-loam-50 text-loam-700">
                    <th scope="col" className="px-4 py-3 font-medium"><span className="sr-only">{tf('site.pricing.annex.title')}</span></th>
                    {COLUMNS.map((key) => (
                      <th key={key} scope="col" className="px-4 py-3 text-center font-semibold text-loam-900">{columns[key]}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-loam-200">
                  {rows.map((row) => (
                    <tr key={row.label}>
                      <th scope="row" className="px-4 py-3 font-normal text-loam-700">{row.label}</th>
                      {row.values.map((value, index) => (
                        <td key={COLUMNS[index]} className="px-4 py-3 text-center">
                          {value === 'yes' ? (
                            <>
                              <Check className="mx-auto h-4 w-4 text-leaf-500" aria-hidden="true" />
                              <span className="sr-only">{tf('site.common.included')}</span>
                            </>
                          ) : value === 'no' ? (
                            <>
                              <Minus className="mx-auto h-4 w-4 text-loam-300" aria-hidden="true" />
                              <span className="sr-only">{tf('site.common.not_included')}</span>
                            </>
                          ) : (
                            <span className="font-semibold text-loam-900">{value}</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </div>
      </section>

      <section className="border-t border-loam-200">
        <div className="mx-auto flex max-w-3xl flex-col items-center px-4 py-16 text-center sm:py-20">
          <h2 className="text-balance font-serif text-3xl font-medium text-prune-900">{tf('site.pricing.contact.title')}</h2>
          <p className="mt-3 text-pretty text-lg text-loam-500">{tf('site.pricing.contact.body', vars)}</p>
          <ButtonLink href="/session/new" size="lg" className="mt-7">{tf('site.common.start_free')}</ButtonLink>
        </div>
      </section>
    </div>
  )
}
