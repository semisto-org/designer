import { Link } from '@inertiajs/react'
import { ArrowRight, Footprints, Lamp, PencilLine, Sprout, type LucideIcon } from 'lucide-react'
import { buttonClass } from '@/components/ui/Button'
import { content, tf } from '@/lib/content'

type Moment = { when: string; where: string; icon: string; title: string; items: string[] }

const ICONS: Record<string, LucideIcon> = { lamp: Lamp, boots: Footprints, pencil: PencilLine, sprout: Sprout }

/**
 * What Terranova does, told as a first year on one's land: an evening at the
 * desk reading the place, a weekend outside checking it, a winter drawing,
 * a spring planting. Every other moment sends the person outdoors.
 */
export function Year() {
  const moments = content<Moment[]>('site.home.year.moments')
  return (
    <section className="relative border-t border-loam-200 bg-white" aria-labelledby="year-title">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:py-24">
        <p className="font-hand text-2xl text-leaf-600">{tf('site.home.year.kicker')}</p>
        <h2 id="year-title" className="mt-1 max-w-3xl text-balance font-serif text-3xl font-medium leading-tight text-prune-900 sm:text-[2.75rem]">
          {tf('site.home.year.title')}
        </h2>
        <p className="mt-4 max-w-2xl text-pretty text-lg leading-relaxed text-loam-500">{tf('site.home.year.intro')}</p>

        <ol className="relative mt-12 grid gap-10 sm:grid-cols-2 sm:gap-x-10 lg:mt-16 lg:grid-cols-4 lg:gap-8">
          {/* The thread of the year, in pencil, behind the stamps. */}
          <span aria-hidden="true" className="absolute inset-x-0 top-[1.375rem] hidden border-t-2 border-dashed border-loam-300 lg:block" />
          {moments.map((moment) => {
            const Icon = ICONS[moment.icon] ?? Sprout
            return (
              <li key={moment.title} className="relative min-w-0">
                <div className="flex items-center gap-3">
                  <span className="relative grid h-11 w-11 shrink-0 place-items-center rounded-full bg-loam-50 text-prune-600 ring-1 ring-loam-200">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <span className="bg-white pr-2 font-hand text-2xl leading-none text-leaf-600">{moment.when}</span>
                </div>
                <p className="mt-3 text-sm text-loam-500">{moment.where}</p>
                <h3 className="mt-1 font-serif text-2xl font-semibold leading-snug text-prune-900">{moment.title}</h3>
                <ul className="mt-3 grid gap-2">
                  {moment.items.map((item) => (
                    <li key={item} className="flex items-start gap-2 text-pretty leading-relaxed text-loam-600">
                      <span aria-hidden="true" className="mt-[0.65rem] h-1.5 w-1.5 shrink-0 rounded-full bg-leaf-500" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </li>
            )
          })}
        </ol>

        <div className="mt-14 flex flex-wrap items-center gap-x-6 gap-y-3">
          <a href="#adresse" className={buttonClass('primary', 'lg')}>{tf('site.home.year.cta')}</a>
          <Link href="/fonctionnalites" className="inline-flex items-center gap-1.5 font-medium text-prune-600 hover:text-prune-800">
            {tf('site.home.year.more')}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </section>
  )
}
