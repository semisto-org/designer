import { usePage } from '@inertiajs/react'
import { Check } from 'lucide-react'
import { CheckoutButton } from '@/components/billing/CheckoutButton'
import { Faq, type FaqItem } from '@/components/site/Faq'
import { PageHero, Section, SectionHeading } from '@/components/site/Section'
import { content, tf } from '@/lib/content'
import { formatPrice } from '@/lib/money'
import type { SharedProps } from '@/types'

type Step = { title: string; body: string }

export default function Drone({ priceCents }: { priceCents: number }) {
  const { currentUser } = usePage().props as unknown as SharedProps
  const steps = content<Step[]>('site.drone.how.steps')
  const gets = content<string[]>('site.drone.gets.items')
  const good = content<string[]>('site.drone.good_to_know.items')
  const faq = content<FaqItem[]>('site.drone.faq.items')
  return (
    <>
      <PageHero eyebrow={tf('site.drone.hero.eyebrow')} title={tf('site.drone.hero.title')} lead={tf('site.drone.hero.lead')}>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <p className="flex items-baseline gap-2">
            <span className="text-4xl font-semibold tracking-tight text-loam-900">{formatPrice(priceCents)}</span>
            <span className="text-sm text-loam-500">{tf('site.drone.hero.price_note')}</span>
          </p>
          <CheckoutButton plan="drone" size="lg">{tf('site.drone.hero.cta_signed_in')}</CheckoutButton>
        </div>
        {!currentUser && <p className="mt-3 text-sm text-loam-500">{tf('site.drone.hero.needs_account')}</p>}
      </PageHero>

      <Section>
        <SectionHeading title={tf('site.drone.how.title')} />
        <ol className="mt-10 grid gap-5 md:grid-cols-3">
          {steps.map((step, index) => (
            <li key={step.title} className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-loam-200/70">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-prune-100 text-sm font-semibold text-prune-700">{index + 1}</span>
              <h3 className="mt-4 text-lg">{step.title}</h3>
              <p className="mt-2 text-pretty text-sm leading-relaxed text-loam-500">{step.body}</p>
            </li>
          ))}
        </ol>
      </Section>

      <Section tone="white">
        <div className="grid gap-12 lg:grid-cols-2">
          <div>
            <h2 className="text-2xl">{tf('site.drone.gets.title')}</h2>
            <ul className="mt-5 space-y-4">
              {gets.map((item) => (
                <li key={item} className="flex gap-3">
                  <Check className="mt-1 h-4 w-4 shrink-0 text-leaf-500" aria-hidden="true" />
                  <span className="text-pretty leading-relaxed text-loam-700">{item}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl bg-humus-50 p-6 ring-1 ring-humus-100">
            <h2 className="text-xl">{tf('site.drone.good_to_know.title')}</h2>
            <ul className="mt-4 space-y-3">
              {good.map((item) => (
                <li key={item} className="text-pretty text-sm leading-relaxed text-loam-700">{item}</li>
              ))}
            </ul>
          </div>
        </div>
      </Section>

      <Section>
        <SectionHeading title={tf('site.drone.faq.title')} />
        <div className="mt-8 max-w-4xl">
          <Faq items={faq} />
        </div>
      </Section>
    </>
  )
}
