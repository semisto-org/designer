import { Link } from '@inertiajs/react'
import { ArrowRight } from 'lucide-react'
import { CtaBand, PageHero, Section } from '@/components/site/Section'
import { iconFor } from '@/components/site/icons'
import { ButtonLink } from '@/components/ui/Button'
import { content, tf } from '@/lib/content'

type Item = { title: string; body: string; plan?: string; link?: string; link_label?: string }
type Group = { id: string; icon: string; title: string; intro: string; items: Item[] }

export default function Features() {
  const groups = content<Group[]>('site.features.groups')
  return (
    <>
      <PageHero eyebrow={tf('site.features.hero.eyebrow')} title={tf('site.features.hero.title')} lead={tf('site.features.hero.lead')}>
        <nav aria-label={tf('site.features.hero.eyebrow')} className="flex flex-wrap gap-2">
          {groups.map((group) => (
            <a key={group.id} href={`#${group.id}`} className="rounded-full bg-white px-3.5 py-1.5 text-sm font-medium text-loam-700 ring-1 ring-loam-200 hover:bg-prune-50 hover:text-prune-700">
              {group.title}
            </a>
          ))}
        </nav>
      </PageHero>

      {groups.map((group, index) => {
        const Icon = iconFor(group.icon)
        return (
          <Section key={group.id} id={group.id} tone={index % 2 === 0 ? 'plain' : 'white'}>
            <div className="grid gap-10 lg:grid-cols-[1fr_2fr]">
              <div>
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-leaf-50 text-leaf-600 ring-1 ring-leaf-100">
                  <Icon className="h-6 w-6" aria-hidden="true" />
                </span>
                <h2 className="mt-4 text-2xl sm:text-3xl">{group.title}</h2>
                <p className="mt-2 text-pretty text-loam-500">{group.intro}</p>
              </div>
              <ul className="grid gap-4 sm:grid-cols-2">
                {group.items.map((item) => (
                  <li key={item.title} className="flex flex-col rounded-xl bg-white p-5 shadow-sm ring-1 ring-loam-200/70">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <h3 className="text-base">{item.title}</h3>
                      {item.plan && (
                        <span className="rounded-full bg-humus-100 px-2.5 py-0.5 text-xs font-medium text-humus-700">{tf('site.common.with_plan')}</span>
                      )}
                    </div>
                    <p className="mt-2 flex-1 text-pretty text-sm leading-relaxed text-loam-500">{item.body}</p>
                    {item.link && (
                      <Link href={item.link} className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-prune-600 hover:text-prune-800">
                        {item.link_label}
                        <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </Section>
        )
      })}

      <CtaBand title={tf('site.features.cta.title')} body={tf('site.features.cta.body')}>
        <ButtonLink href="/session/new" size="lg" variant="leaf">{tf('site.common.start_free')}</ButtonLink>
        <ButtonLink href="/tarifs" size="lg" variant="secondary">{tf('site.common.see_pricing')}</ButtonLink>
      </CtaBand>
    </>
  )
}
