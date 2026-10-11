import { Link } from '@inertiajs/react'
import { ArrowRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { Standouts } from '@/components/site/Standouts'
import { Timelapse } from '@/components/site/timelapse/Timelapse'
import { ButtonLink } from '@/components/ui/Button'
import { content, tf } from '@/lib/content'
import { formatPrice } from '@/lib/money'
import type { CatalogPlan } from '@/types/billing'

type Source = { name: string; detail: string }
type Tier = { name: string; price: string; note: string }

/** The home page: thirty years of an example terrain as you scroll, the standout features, then the practical notes. */
export default function Home({ catalog }: { catalog: CatalogPlan[] }) {
  const price = (key: string) => formatPrice(catalog.find((plan) => plan.key === key)?.priceCents ?? 0)
  const tiers = content<Tier[]>('site.home.practical.pricing.tiers', { yearly: price('yearly'), atelier: price('atelier') })
  const sources = content<Source[]>('site.home.practical.data.sources')

  return (
    <>
      <Timelapse>
        <div className="mt-3 flex flex-wrap gap-2.5">
          <ButtonLink href="/session/new">{tf('site.home.story.final_cta')}</ButtonLink>
          <ButtonLink href="/tarifs" variant="secondary">{tf('site.home.story.final_secondary')}</ButtonLink>
        </div>
        <p className="font-hand text-[1.4rem] leading-tight text-leaf-600">{tf('site.home.story.free')}</p>
        <p className="text-xs text-loam-400">{tf('site.home.story.example')}</p>
      </Timelapse>

      <Standouts />

      <section className="relative z-10 border-t border-loam-200 bg-loam-50" aria-labelledby="practical-title">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:py-24">
          <p className="font-hand text-2xl text-leaf-600">{tf('site.home.practical.kicker')}</p>
          <h2 id="practical-title" className="mt-1 max-w-2xl text-balance text-3xl font-medium leading-tight text-prune-900 sm:text-4xl">{tf('site.home.practical.title')}</h2>

          <div className="mt-12 grid gap-x-12 gap-y-14 lg:grid-cols-2">
            <Note kicker={tf('site.home.practical.data.kicker')} title={tf('site.home.practical.data.title')} body={tf('site.home.practical.data.body')} cta={{ href: '/fonctionnalites', label: tf('site.home.practical.data.cta') }}>
              <dl className="mt-5 divide-y divide-dashed divide-loam-300 border-y border-dashed border-loam-300">
                {sources.map((source) => (
                  <div key={source.name} className="grid gap-1 py-3 sm:grid-cols-[8rem_1fr] sm:gap-4">
                    <dt className="font-serif text-lg font-semibold text-prune-900">{source.name}</dt>
                    <dd className="text-sm text-loam-500">{source.detail}</dd>
                  </div>
                ))}
              </dl>
            </Note>

            <Note kicker={tf('site.home.practical.pricing.kicker')} title={tf('site.home.practical.pricing.title')} body={tf('site.home.practical.pricing.body')} cta={{ href: '/tarifs', label: tf('site.home.practical.pricing.cta') }}>
              <ul className="mt-5 divide-y divide-dashed divide-loam-300 border-y border-dashed border-loam-300">
                {tiers.map((tier) => (
                  <li key={tier.name} className="flex items-baseline justify-between gap-4 py-3">
                    <span className="text-loam-700">{tier.name}</span>
                    <span className="text-right">
                      <span className="font-serif text-2xl font-semibold text-prune-900 tabular-nums">{tier.price}</span>
                      <span className="block text-xs text-loam-500">{tier.note}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </Note>

            <Note kicker={tf('site.home.practical.open.kicker')} body={tf('site.home.practical.open.body')} cta={{ href: '/open-source', label: tf('site.home.practical.open.cta') }} />
          </div>
        </div>
      </section>
    </>
  )
}

function Note({ kicker, title, body, cta, children }: {
  kicker: string
  title?: string
  body: string
  cta: { href: string; label: string }
  children?: ReactNode
}) {
  return (
    <div className="min-w-0">
      <p className="font-hand text-xl text-prune-600">{kicker}</p>
      {title && <h3 className="mt-1 font-serif text-2xl font-semibold text-prune-900">{title}</h3>}
      <p className="mt-2 max-w-prose text-pretty leading-relaxed text-loam-500">{body}</p>
      {children}
      <Link href={cta.href} className="mt-4 inline-flex items-center gap-1.5 font-medium text-prune-600 hover:text-prune-800">
        {cta.label}
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </Link>
    </div>
  )
}
