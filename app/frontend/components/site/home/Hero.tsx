import { Link } from '@inertiajs/react'
import clsx from 'clsx'
import { Check } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Tape } from '@/components/site/Standouts'
import { content, tf } from '@/lib/content'
import { AddressDoor } from './AddressDoor'
import terrain from './terrain.webp'

// An example parcel, drawn over terrain.webp (a Walloon meadow between a
// lane and a hedge, 1200 × 900): the outline a visitor's own parcel gets.
const PARCEL = '165,350 1000,318 1010,598 622,660 420,720 120,795 45,675 30,480 82,352'

/**
 * The first screen: « Où est ton terrain ? ». The address is the way in;
 * beside it, a real place seen from the air, its parcel pencilled in and a
 * few notes, as the first page of the visitor's notebook will look.
 */
export function Hero() {
  const appears = content<string[]>('site.home.hero.appears')
  return (
    <section id="adresse" className="relative scroll-mt-4 overflow-hidden bg-loam-50" aria-labelledby="hero-title">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-10 sm:py-16 lg:grid-cols-[1fr_1.15fr] lg:gap-14 lg:py-14">
        <div className="min-w-0">
          <p className="font-hand text-2xl text-leaf-600">{tf('site.home.hero.kicker')}</p>
          <h1 id="hero-title" className="mt-1 text-balance font-serif text-5xl font-medium leading-[1.05] text-prune-900 sm:text-6xl">
            {tf('site.home.hero.title')}
          </h1>
          <p className="mt-5 max-w-xl text-pretty text-lg leading-relaxed text-loam-600">{tf('site.home.hero.body')}</p>

          <AddressDoor className="mt-8 max-w-xl" />
          <p className="mt-3 font-hand text-[1.35rem] leading-tight text-leaf-600">{tf('site.home.hero.free')}</p>

          <div className="mt-8 max-w-xl border-t border-dashed border-loam-300 pt-5">
            <p className="text-sm font-medium text-loam-700">{tf('site.home.hero.appears_title')}</p>
            <ul className="mt-2 grid gap-1.5">
              {appears.map((line) => (
                <li key={line} className="flex items-start gap-2 text-loam-600">
                  <Check className="mt-1 h-4 w-4 shrink-0 text-leaf-600" aria-hidden="true" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
            <p className="mt-5 flex flex-wrap gap-x-5 gap-y-1 text-sm">
              <Link href="/session/new" className="font-medium text-prune-600 underline-offset-4 hover:text-prune-800 hover:underline">{tf('site.home.hero.account')}</Link>
              <Link href="/tarifs" className="font-medium text-prune-600 underline-offset-4 hover:text-prune-800 hover:underline">{tf('site.home.hero.pricing')}</Link>
            </p>
          </div>
        </div>

        <ExamplePlace />
      </div>
    </section>
  )
}

/** The example place: a taped aerial print, its parcel drawing itself in pencil, and the notebook's first page beside it. */
function ExamplePlace() {
  const [drawn, setDrawn] = useState(false)
  useEffect(() => {
    const id = window.setTimeout(() => setDrawn(true), 250)
    return () => window.clearTimeout(id)
  }, [])
  const lines = content<string[]>('site.home.hero.page.lines')

  return (
    <figure className="relative mx-auto w-full max-w-2xl">
      <div className="relative -rotate-1 bg-white p-2.5 pb-3 shadow-[0_1px_0_rgb(43_41_64/0.08),0_24px_40px_-24px_rgb(43_41_64/0.45)] ring-1 ring-loam-900/5 sm:p-3">
        <Tape className="-top-3 left-10 -rotate-6" />
        <Tape className="-top-3 right-10 rotate-[5deg]" />
        <div className="relative overflow-hidden bg-loam-200">
          <img src={terrain} alt={tf('site.home.hero.photo.alt')} width={1200} height={900} fetchPriority="high" decoding="async" className="block aspect-[4/3] w-full object-cover" />
          <svg viewBox="0 0 1200 900" className="absolute inset-0 h-full w-full" aria-hidden="true">
            <polygon points={PARCEL} className="fill-humus-200/15" />
            <polygon
              points={PARCEL}
              pathLength={1}
              strokeDasharray="1"
              className="fill-none stroke-loam-50 transition-[stroke-dashoffset] duration-[2600ms] ease-out motion-reduce:transition-none"
              style={{ strokeDashoffset: drawn ? 0 : 1 }}
              strokeWidth={5}
              strokeLinejoin="round"
            />
            <circle cx="150" cy="660" r="62" className="fill-none stroke-humus-200" strokeWidth={4} strokeDasharray="14 12" />
          </svg>
          <Note className="left-[38%] top-[40%] -rotate-2 sm:top-[52%] text-[1.5rem] sm:text-[1.9rem]">{tf('site.home.hero.photo.parcel')}</Note>
          <Note className="right-[4%] top-[17%] hidden rotate-1 sm:block">{tf('site.home.hero.photo.path')}</Note>
          <Note className="left-[3%] top-[5%] hidden -rotate-2 sm:block">{tf('site.home.hero.photo.hedge')}</Note>
          <Note className="left-[19%] top-[62%] max-w-[13rem] rotate-1 sm:left-[22%] sm:top-[71%]">{tf('site.home.hero.photo.check')}</Note>
        </div>
        <figcaption className="mt-2 px-1 text-sm text-loam-500">{tf('site.home.hero.photo.credit')}</figcaption>
      </div>

      <div className="relative mx-4 mt-4 rotate-1 rounded-2xl bg-white p-4 shadow-lg ring-1 ring-loam-900/10 sm:ml-auto sm:mr-4 sm:max-w-xs lg:-mr-6">
        <p className="font-hand text-xl leading-tight text-prune-600">{tf('site.home.hero.page.kicker')}</p>
        <ul className="mt-2 grid gap-1">
          {lines.map((line) => (
            <li key={line} className="flex items-start gap-2 font-hand text-[1.3rem] leading-snug text-loam-700">
              <PencilTick className="mt-1.5 shrink-0 text-leaf-600" />
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </div>
    </figure>
  )
}

/** A handwritten note on a scrap of paper, laid on the photo. */
function Note({ className, children }: { className: string; children: string }) {
  return (
    <span className={clsx('absolute rounded-md bg-loam-50/90 px-2 py-0.5 font-hand text-lg leading-tight text-prune-800 shadow-sm sm:text-xl', className)}>
      {children}
    </span>
  )
}

/** A tick drawn in pencil. */
function PencilTick({ className }: { className?: string }) {
  return (
    <svg width="16" height="14" viewBox="0 0 16 14" aria-hidden="true" className={className}>
      <path d="M1.5 7.5c1.6 1.2 2.8 2.6 3.8 4.6C7.4 7.4 10.6 3.6 14.6 1.4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
