import { Link } from '@inertiajs/react'
import { ArrowRight, Check } from 'lucide-react'
import { Eyebrow, Section, SectionHeading, CtaBand } from '@/components/site/Section'
import { HeroMap } from '@/components/site/HeroMap'
import { iconFor } from '@/components/site/icons'
import { ButtonLink } from '@/components/ui/Button'
import { content, tf } from '@/lib/content'
import { formatPrice } from '@/lib/money'
import type { CatalogPlan } from '@/types/billing'

type Step = { title: string; body: string }
type Highlight = { icon: string; title: string; body: string }
type Tier = { name: string; price: string; note: string }

export default function Home({ catalog }: { catalog: CatalogPlan[] }) {
  const price = (key: string) => formatPrice(catalog.find((plan) => plan.key === key)?.priceCents ?? 0)
  const vars = { yearly: price('yearly'), atelier: price('atelier') }
  const trust = content<string[]>('site.home.trust')
  const steps = content<Step[]>('site.home.cycle.steps')
  const highlights = content<Highlight[]>('site.home.highlights.items')
  const points = content<string[]>('site.home.claude.points')
  const tiers = content<Tier[]>('site.home.pricing.tiers', vars)

  return (
    <>
      <header className="relative overflow-hidden bg-gradient-to-b from-prune-50 via-loam-50 to-loam-50">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-14 pt-10 sm:pt-16 lg:grid-cols-[1fr_1.05fr] lg:gap-12 lg:pb-20">
          <div>
            <Eyebrow>{tf('site.home.hero.eyebrow')}</Eyebrow>
            <h1 className="mt-3 text-balance text-[1.85rem] leading-[1.12] tracking-tight sm:text-[2.6rem] lg:text-[2.9rem]">{tf('site.home.hero.title')}</h1>
            <p className="mt-5 max-w-xl text-pretty text-base leading-relaxed text-loam-500 sm:text-lg">{tf('site.home.hero.lead')}</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <ButtonLink href="/session/new" size="lg">{tf('site.home.hero.cta_primary')}</ButtonLink>
              <ButtonLink href="/fonctionnalites" size="lg" variant="secondary">{tf('site.home.hero.cta_secondary')}</ButtonLink>
            </div>
            <p className="mt-4 text-sm text-loam-500">{tf('site.home.hero.note')}</p>
          </div>
          <HeroMap className="mx-auto w-full max-w-xl lg:max-w-none" />
        </div>
        <div className="border-t border-loam-200/70 bg-white/60">
          <ul className="mx-auto flex max-w-6xl flex-wrap justify-center gap-x-8 gap-y-2 px-4 py-4 text-sm text-loam-500">
            {trust.map((item) => (
              <li key={item} className="flex items-center gap-2">
                <Check className="h-4 w-4 text-leaf-500" aria-hidden="true" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </header>

      <Section>
        <SectionHeading center eyebrow={tf('site.home.cycle.eyebrow')} title={tf('site.home.cycle.title')} intro={tf('site.home.cycle.intro')} />
        <ol className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((step, index) => (
            <li key={step.title} className="relative rounded-2xl bg-white p-6 shadow-sm ring-1 ring-loam-200/70">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-prune-100 text-sm font-semibold text-prune-700">{index + 1}</span>
              <h3 className="mt-4 text-lg">{step.title}</h3>
              <p className="mt-2 text-pretty text-sm leading-relaxed text-loam-500">{step.body}</p>
            </li>
          ))}
        </ol>
      </Section>

      <Section tone="white">
        <SectionHeading eyebrow={tf('site.home.highlights.eyebrow')} title={tf('site.home.highlights.title')} />
        <ul className="mt-10 grid gap-x-8 gap-y-9 sm:grid-cols-2 lg:grid-cols-3">
          {highlights.map((item) => {
            const Icon = iconFor(item.icon)
            return (
              <li key={item.title} className="flex gap-4">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-leaf-50 text-leaf-600 ring-1 ring-leaf-100">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <div>
                  <h3 className="text-base">{item.title}</h3>
                  <p className="mt-1 text-pretty text-sm leading-relaxed text-loam-500">{item.body}</p>
                </div>
              </li>
            )
          })}
        </ul>
        <Link href="/fonctionnalites" className="mt-10 inline-flex items-center gap-1.5 font-medium text-prune-600 hover:text-prune-800">
          {tf('site.home.highlights.cta')}
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </Section>

      <Section tone="prune">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <SectionHeading
            tone="dark"
            eyebrow={tf('site.home.claude.eyebrow')}
            title={tf('site.home.claude.title')}
            intro={tf('site.home.claude.body')}
          />
          <div>
            <ul className="space-y-4">
              {points.map((point) => (
                <li key={point} className="flex gap-3 text-prune-100">
                  <Check className="mt-1 h-4 w-4 shrink-0 text-leaf-300" aria-hidden="true" />
                  <span className="text-pretty leading-relaxed">{point}</span>
                </li>
              ))}
            </ul>
            <ButtonLink href="/help/connecter-claude" variant="secondary" className="mt-8">{tf('site.home.claude.cta')}</ButtonLink>
          </div>
        </div>
      </Section>

      <Section>
        <div className="grid items-center gap-8 lg:grid-cols-[1fr_1.2fr]">
          <div>
            <Eyebrow>{tf('site.home.showcase.eyebrow')}</Eyebrow>
            <h2 className="mt-2 text-balance text-2xl sm:text-3xl">{tf('site.home.showcase.title')}</h2>
          </div>
          <div>
            <p className="text-pretty text-lg leading-relaxed text-loam-600">{tf('site.home.showcase.body')}</p>
            <Link href="/open-source" className="mt-5 inline-flex items-center gap-1.5 font-medium text-prune-600 hover:text-prune-800">
              {tf('site.home.showcase.cta')}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </Section>

      <Section tone="leaf">
        <SectionHeading center eyebrow={tf('site.home.pricing.eyebrow')} title={tf('site.home.pricing.title')} intro={tf('site.home.pricing.body')} />
        <ul className="mx-auto mt-10 grid max-w-4xl gap-4 sm:grid-cols-3">
          {tiers.map((tier, index) => (
            <li key={tier.name} className={'rounded-2xl bg-white p-6 text-center shadow-sm ' + (index === 1 ? 'ring-2 ring-prune-500' : 'ring-1 ring-loam-200/70')}>
              <h3 className="text-base text-loam-700">{tier.name}</h3>
              <p className="mt-3 text-3xl font-semibold tracking-tight text-loam-900">{tier.price}</p>
              <p className="mt-1 text-sm text-loam-500">{tier.note}</p>
            </li>
          ))}
        </ul>
        <div className="mt-8 text-center">
          <ButtonLink href="/tarifs" variant="secondary">{tf('site.home.pricing.cta')}</ButtonLink>
        </div>
      </Section>

      <Section tone="white">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-balance text-2xl sm:text-3xl">{tf('site.home.open_source.title')}</h2>
          <p className="mt-3 text-pretty text-lg leading-relaxed text-loam-500">{tf('site.home.open_source.body')}</p>
          <ButtonLink href="/open-source" variant="secondary" className="mt-6">{tf('site.home.open_source.cta')}</ButtonLink>
        </div>
      </Section>

      <CtaBand title={tf('site.home.final.title')} body={tf('site.home.final.body')}>
        <ButtonLink href="/session/new" size="lg" variant="leaf">{tf('site.home.final.cta')}</ButtonLink>
      </CtaBand>
    </>
  )
}
