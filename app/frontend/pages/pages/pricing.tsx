import { Check, Minus } from 'lucide-react'
import { CheckoutButton } from '@/components/billing/CheckoutButton'
import { PlanCard } from '@/components/billing/PlanCard'
import { Faq, type FaqItem } from '@/components/site/Faq'
import { CtaBand, Eyebrow, PageHero, Section, SectionHeading } from '@/components/site/Section'
import { ButtonLink } from '@/components/ui/Button'
import { content, tf } from '@/lib/content'
import { formatPrice } from '@/lib/money'
import type { CatalogKey, CatalogPlan } from '@/types/billing'

type Row = { label: string; values: string[] }
const COLUMNS: CatalogKey[] = ['free', 'yearly', 'atelier', 'bureau']

export default function Pricing({ catalog, memberPriceCents, contactEmail }: { catalog: CatalogPlan[]; memberPriceCents: number; contactEmail: string }) {
  const plan = (key: CatalogKey) => catalog.find((p) => p.key === key)!
  const price = (key: CatalogKey) => formatPrice(plan(key).priceCents)
  const vars = {
    yearly: price('yearly'), atelier: price('atelier'), bureau: price('bureau'), drone: price('drone'),
    member: formatPrice(memberPriceCents), email: contactEmail,
  }
  const columns = content<Record<string, string>>('site.pricing.compare.columns')
  const rows = content<Row[]>('site.pricing.compare.rows')
  const faq = content<FaqItem[]>('site.pricing.faq.items', vars)

  const action = (key: CatalogKey) =>
    key === 'free' ? (
      <ButtonLink href="/session/new" variant="secondary" className="w-full">{tf('site.pricing.cta_free')}</ButtonLink>
    ) : (
      <CheckoutButton plan={key} variant={key === 'yearly' ? 'primary' : 'secondary'} className="w-full">
        {tf('site.pricing.cta_choose')}
      </CheckoutButton>
    )

  return (
    <>
      <PageHero eyebrow={tf('site.pricing.hero.eyebrow')} title={tf('site.pricing.hero.title')} lead={tf('site.pricing.hero.lead')} />

      <Section>
        <div className="grid gap-x-8 gap-y-14 lg:grid-cols-2">
          <div>
            <SectionHeading className="lg:min-h-[7.25rem]" title={tf('site.pricing.individuals.title')} intro={tf('site.pricing.individuals.intro')} />
            <div className="mt-8 grid gap-6 sm:grid-cols-2">
              <PlanCard plan={plan('free')} action={action('free')} />
              <PlanCard plan={plan('yearly')} action={action('yearly')} highlighted badge={tf('site.pricing.badge_individual')} />
            </div>
          </div>
          <div>
            <SectionHeading className="lg:min-h-[7.25rem]" title={tf('site.pricing.pros.title')} intro={tf('site.pricing.pros.intro')} />
            <div className="mt-8 grid gap-6 sm:grid-cols-2">
              <PlanCard plan={plan('atelier')} action={action('atelier')} />
              <PlanCard plan={plan('bureau')} action={action('bureau')} />
            </div>
          </div>
        </div>
      </Section>

      <Section tone="leaf">
        <div className="grid items-center gap-8 lg:grid-cols-[1.2fr_1fr]">
          <div>
            <Eyebrow>{tf('site.pricing.member.eyebrow')}</Eyebrow>
            <h2 className="mt-2 text-balance text-2xl sm:text-3xl">{tf('site.pricing.member.title')}</h2>
            <p className="mt-3 max-w-2xl text-pretty text-lg leading-relaxed text-loam-600">{tf('site.pricing.member.body', vars)}</p>
          </div>
          <div>
            <p className="text-pretty text-loam-500">{tf('site.pricing.member.note')}</p>
            <a href="https://www.semisto.org" className="mt-4 inline-flex rounded-lg bg-white px-4 py-2 text-sm font-medium text-loam-800 ring-1 ring-inset ring-loam-200 hover:bg-loam-100">
              {tf('site.pricing.member.cta')}
            </a>
          </div>
        </div>
      </Section>

      <Section tone="white">
        <SectionHeading title={tf('site.pricing.compare.title')} />
        <div className="mt-8 overflow-x-auto rounded-xl ring-1 ring-loam-200">
          <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
            <thead>
              <tr className="bg-loam-50 text-loam-700">
                <th scope="col" className="px-4 py-3 font-medium"><span className="sr-only">{tf('site.pricing.compare.title')}</span></th>
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
      </Section>

      <Section>
        <div className="flex flex-col items-start gap-5 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-loam-200/70 sm:flex-row sm:items-center sm:justify-between sm:p-8">
          <div className="max-w-2xl">
            <h2 className="text-balance text-xl sm:text-2xl">{tf('site.pricing.drone.title', vars)}</h2>
            <p className="mt-2 text-pretty text-loam-500">{tf('site.pricing.drone.body')}</p>
          </div>
          <ButtonLink href="/mission-drone" variant="secondary" className="shrink-0">{tf('site.pricing.drone.cta')}</ButtonLink>
        </div>
      </Section>

      <Section tone="white">
        <SectionHeading title={tf('site.pricing.faq.title')} />
        <div className="mt-8 max-w-4xl">
          <Faq items={faq} />
        </div>
      </Section>

      <CtaBand title={tf('site.pricing.contact.title')} body={tf('site.pricing.contact.body', vars)}>
        <ButtonLink href="/session/new" size="lg" variant="leaf">{tf('site.common.start_free')}</ButtonLink>
      </CtaBand>
    </>
  )
}
