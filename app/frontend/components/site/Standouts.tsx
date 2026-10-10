import { Link } from '@inertiajs/react'
import { ArrowRight } from 'lucide-react'
import clsx from 'clsx'
import { useEffect, useRef, useState } from 'react'
import { content, tf } from '@/lib/content'
import aiDrafts from './standouts/ai-drafts.webp'
import bioindicators from './standouts/bioindicators.webp'
import rain from './standouts/rain.webp'
import sketch from './standouts/sketch.webp'

const IMAGES: Record<string, string> = { 'ai-drafts': aiDrafts, bioindicators, rain, sketch }

type Entry = {
  id: string
  image: string
  kicker: string
  title: string
  body: string
  note: string
  caption: string
  alt: string
  link: string
  link_label: string
  plan?: boolean
  plan_note?: string
}
type MarginNote = { kicker: string; title: string; body: string; link?: string; link_label?: string }

/**
 * The standout features as pages of a field notebook: a real screenshot taped
 * in, a handwritten note in the margin, and what it teaches about one's land.
 * Shared by the home page and the top of « Fonctionnalités ».
 */
export function Standouts({ headingLevel = 2 }: { headingLevel?: 1 | 2 }) {
  const entries = content<Entry[]>('site.standouts.entries')
  const notes = content<MarginNote[]>('site.standouts.margins.notes')
  const Heading = headingLevel === 1 ? 'h1' : 'h2'

  return (
    <section className="relative z-10 overflow-hidden border-t border-loam-200 bg-loam-50" aria-labelledby="standouts-title">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:py-24">
        <p className="font-hand text-2xl text-leaf-600">{tf('site.standouts.kicker')}</p>
        <Heading id="standouts-title" className="mt-1 max-w-3xl text-balance text-3xl font-medium leading-tight text-prune-900 sm:text-[2.75rem]">
          {tf('site.standouts.title')}
        </Heading>
        <p className="mt-4 max-w-2xl text-pretty text-lg leading-relaxed text-loam-500">{tf('site.standouts.intro')}</p>

        <ol className="mt-14 grid gap-20 sm:mt-20 sm:gap-28">
          {entries.map((entry, index) => (
            <StandoutEntry key={entry.id} entry={entry} index={index} />
          ))}
        </ol>

        <div className="mt-24 border-t border-dashed border-loam-300 pt-10 sm:mt-32">
          <p className="font-hand text-2xl text-prune-600">{tf('site.standouts.margins.kicker')}</p>
          <ul className="mt-6 grid gap-10 md:grid-cols-3 md:gap-0 md:divide-x md:divide-dashed md:divide-loam-300">
            {notes.map((note) => (
              <li key={note.title} className="min-w-0 md:px-8 md:first:pl-0 md:last:pr-0">
                <p className="font-hand text-xl text-leaf-600">{note.kicker}</p>
                <h3 className="mt-1 text-balance font-serif text-xl font-semibold leading-snug text-prune-900">{note.title}</h3>
                <p className="mt-2 text-pretty text-sm leading-relaxed text-loam-500">{note.body}</p>
                {note.link && (
                  <Link href={note.link} className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-prune-600 hover:text-prune-800">
                    {note.link_label}
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}

function StandoutEntry({ entry, index }: { entry: Entry; index: number }) {
  const flipped = index % 2 === 1
  const { ref, seen } = useSeen<HTMLLIElement>()
  // Each photo leans its own way, like prints taped in by hand.
  const tilt = [-1.6, 1.2, -0.9, 1.5][index % 4]

  return (
    <li ref={ref} id={entry.id} className="scroll-mt-24 grid items-center gap-10 lg:grid-cols-[1.2fr_1fr] lg:gap-16">
      <figure className={clsx('relative mx-auto w-full max-w-2xl', flipped && 'lg:order-2')}>
        <div
          className="relative bg-white p-2.5 pb-3 shadow-[0_1px_0_rgb(43_41_64/0.08),0_24px_40px_-24px_rgb(43_41_64/0.45)] ring-1 ring-loam-900/5 transition-[transform,opacity] duration-[1400ms] ease-out motion-reduce:transition-none sm:p-3 sm:pb-4"
          style={{ transform: `rotate(${seen ? tilt : 0}deg) translateY(${seen ? 0 : 12}px)`, opacity: seen ? 1 : 0.6 }}
        >
          <Tape className="-top-3 left-8 -rotate-6" />
          <Tape className="-top-3 right-8 rotate-[5deg]" />
          <img src={IMAGES[entry.image]} alt={entry.alt} loading="lazy" decoding="async" className="block aspect-[3/2] w-full bg-loam-100 object-cover" />
          <figcaption className="mt-2 px-1 font-hand text-lg leading-tight text-loam-600 sm:text-xl">{entry.caption}</figcaption>
        </div>
      </figure>

      <div className={clsx('min-w-0', flipped && 'lg:order-1')}>
        <p className="font-hand text-2xl text-leaf-600">
          <span className="mr-2 font-serif text-lg text-loam-400 tabular-nums">{String(index + 1).padStart(2, '0')}</span>
          {entry.kicker}
        </p>
        <h3 className="mt-1 text-balance font-serif text-[1.75rem] font-medium leading-[1.12] text-prune-900 sm:text-4xl">{entry.title}</h3>
        <p className="mt-4 max-w-prose text-pretty leading-relaxed text-loam-600">{entry.body}</p>

        <p className={clsx('mt-5 flex items-start gap-2 font-hand text-[1.45rem] leading-tight text-prune-600', flipped && 'lg:flex-row-reverse lg:text-right')}>
          <MarginArrow className={clsx('mt-1 shrink-0', flipped ? 'lg:-scale-x-100' : 'max-lg:rotate-90')} />
          <span>{entry.note}</span>
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2">
          <Link href={entry.link} className="inline-flex items-center gap-1.5 font-medium text-prune-600 hover:text-prune-800">
            {entry.link_label}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
          {entry.plan && (
            <span className="rounded-full bg-humus-100 px-2.5 py-0.5 text-xs font-medium text-humus-700">
              {entry.plan_note ?? tf('site.standouts.plan')}
            </span>
          )}
        </div>
      </div>
    </li>
  )
}

/** A strip of paper tape holding a print to the page. */
function Tape({ className }: { className: string }) {
  return <span aria-hidden="true" className={clsx('absolute h-6 w-20 bg-humus-200/70 shadow-sm mix-blend-multiply', className)} />
}

/** A pencil arrow from the note towards the picture. */
function MarginArrow({ className }: { className?: string }) {
  return (
    <svg width="34" height="22" viewBox="0 0 34 22" aria-hidden="true" className={className}>
      <path d="M32 18c-7 2-16 1-22-5S5 4 3 3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M2 9 3 3l6 1" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/** True once the element has come into view (stays true), for a gentle settle. */
function useSeen<T extends Element>() {
  const ref = useRef<T>(null)
  const [seen, setSeen] = useState(false)
  useEffect(() => {
    const node = ref.current
    if (!node || typeof IntersectionObserver === 'undefined') {
      setSeen(true)
      return
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setSeen(true)
        observer.disconnect()
      }
    }, { rootMargin: '0px 0px -15% 0px' })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  return { ref, seen }
}
