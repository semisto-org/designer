import { Link } from '@inertiajs/react'
import { useEffect, useRef, useState } from 'react'
import { Wordmark } from '@/components/Logo'
import { ButtonLink } from '@/components/ui/Button'
import { content, tf } from '@/lib/content'
import { t } from '@/lib/i18n'
import { Painter, readPalette, type Labels, type Particle, type PlantedTree } from './draw.ts'
import { PLANTABLE, PARCEL, calendar, insidePolygon, lerp, stateAt, type SceneState } from './model.ts'
import { loadPaint } from './paint.ts'
import atlas from './paint/atlas.webp'
import bed from './paint/bed.webp'
import house from './paint/house.webp'
import meadow from './paint/meadow.webp'
import small from './paint/small.webp'

type ChapterCopy = { kicker: string; title: string; body: string; hint?: string }

/** Years marked on the thread at the right edge. */
const MARKS = [0, 5, 15, 30]
/** Early years get more room on the thread, as they do in the scroll. */
const threadPos = (tau: number) => Math.sqrt(Math.min(Math.max(tau, 0), 30.5) / 30.5) * 100

/**
 * The home page story: the screen is an example terrain, and scrolling makes
 * thirty years pass on it, from bare ground in January 2026 to a grown forest
 * garden among its neighbours. The chapters are notes pinned in the margin.
 */
export function Timelapse({ children }: { children?: React.ReactNode }) {
  const chapters = content<ChapterCopy[]>('site.home.story.chapters')
  const months = content<string[]>('site.home.story.months')
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const sectionsRef = useRef<(HTMLElement | null)[]>([])
  const [stamp, setStamp] = useState({ tau: 0, chapter: 0, zoom: 1, past: false })

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const labels = content<Labels>('site.home.story.canvas')
    const painter = new Painter(ctx, readPalette(document.documentElement), labels, reduce)
    let alive = true
    // the painted sprites arrive after the first frame; the washes stand in until then
    loadPaint({ atlas, small, meadow, house, bed }).then((paint) => alive && painter.setPaint(paint), () => {})
    const particles: Particle[] = []
    const planted: (PlantedTree & { t0: number })[] = []
    let vw = 0
    let vh = 0
    let dpr = 1
    let tops: number[] = []
    let wind = 0
    let last = performance.now()
    let frame = 0
    let shown: SceneState = { tau: 0, zoom: 1, observe: 0, plan: 0, plantMode: false, chapter: 0 }
    let cam = painter.camera(1, 1, 1)
    let lastStamp = ''

    const measure = () => {
      tops = sectionsRef.current.map((el) => (el ? el.getBoundingClientRect().top + window.scrollY : 0))
    }
    const resize = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1)
      vw = window.innerWidth
      vh = window.innerHeight
      canvas.width = Math.round(vw * dpr)
      canvas.height = Math.round(vh * dpr)
      measure()
    }
    const target = () => stateAt(tops, window.scrollY + vh * 0.35, vh)

    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      wind += dt
      // once the story has scrolled away, the practical notes cover the canvas: stop painting
      const past = (rootRef.current?.getBoundingClientRect().bottom ?? vh) < vh * 0.5
      const goal = target()
      // time eases towards the scroll position, so a fast scroll reads as a time-lapse
      const ease = reduce ? 1 : 1 - Math.pow(0.0015, dt)
      shown = {
        tau: lerp(shown.tau, goal.tau, ease),
        zoom: lerp(shown.zoom, goal.zoom, ease),
        observe: lerp(shown.observe, goal.observe, ease),
        plan: lerp(shown.plan, goal.plan, ease),
        plantMode: goal.plantMode,
        chapter: goal.chapter,
      }
      canvas.style.cursor = shown.plantMode ? 'crosshair' : ''
      for (const p of planted) p.age = Math.min(30, ((now - p.t0) / 1000) * 2.5)
      cam = painter.camera(vw, vh, shown.zoom)
      if (!past) {
        const season = painter.draw(shown, cam, vw, vh, dpr, wind, planted, particles)
        painter.step(particles, season, shown.tau, dt)
      }
      const key = `${calendar(shown.tau).year}-${calendar(shown.tau).month}-${shown.chapter}-${shown.zoom < 0.7}-${past}`
      if (key !== lastStamp) {
        lastStamp = key
        setStamp({ tau: shown.tau, chapter: shown.chapter, zoom: shown.zoom, past })
      }
      frame = requestAnimationFrame(loop)
    }

    const plant = (event: MouseEvent) => {
      if (!shown.plantMode) return
      const x = (event.clientX - cam.ox) / cam.k
      const y = (event.clientY - cam.oy) / cam.k
      if (!insidePolygon(x, y, PARCEL)) return
      planted.push({ sp: PLANTABLE[planted.length % PLANTABLE.length], x, y, seed: 9000 + planted.length * 31, age: 0, t0: performance.now() })
    }

    resize()
    shown = target()
    window.addEventListener('resize', resize)
    canvas.addEventListener('click', plant)
    void document.fonts?.ready.then(measure)
    frame = requestAnimationFrame(loop)
    return () => {
      alive = false
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', resize)
      canvas.removeEventListener('click', plant)
    }
  }, [])

  const cal = calendar(stamp.tau)
  const stageLabel = cal.stage === 'growing'
    ? tf('site.home.story.stamp.growing', { year: cal.gardenYear })
    : tf(`site.home.story.stamp.${cal.stage}`)
  const hideStamp = stamp.zoom < 0.7 || stamp.chapter === 0 || stamp.past

  return (
    <div ref={rootRef} className="timelapse relative">
      <canvas ref={canvasRef} className="fixed inset-0 z-0 block h-dvh w-screen" aria-hidden="true" />

      <header className={'pointer-events-none fixed inset-x-0 top-0 z-20 flex items-center justify-between gap-3 px-4 pb-3 pt-[calc(0.85rem+env(safe-area-inset-top))] transition-colors duration-300 sm:px-8 ' + (stamp.past ? 'border-b border-loam-200 bg-loam-50/95' : '')}>
        <Link href="/" className="pointer-events-auto flex items-center gap-5 rounded-full bg-loam-50/90 px-4 py-2 shadow-sm ring-1 ring-loam-900/5" aria-label="Semisto Designer">
          <Wordmark />
        </Link>
        <nav className="pointer-events-auto hidden items-center gap-5 rounded-full bg-loam-50/90 px-5 py-2.5 text-sm font-medium text-loam-700 shadow-sm ring-1 ring-loam-900/5 md:flex" aria-label={t('site.nav.menu')}>
          <Link href="/fonctionnalites" className="hover:text-prune-600">{t('public.nav.features')}</Link>
          <Link href="/tarifs" className="hover:text-prune-600">{t('public.nav.pricing')}</Link>
          <Link href="/help" className="hover:text-prune-600">{t('public.nav.help')}</Link>
          <Link href="/session/new" className="hover:text-prune-600">{t('public.nav.sign_in')}</Link>
        </nav>
        <ButtonLink href="/session/new" size="sm" className="pointer-events-auto">{tf('site.home.story.cta')}</ButtonLink>
      </header>

      <div
        className={'pointer-events-none fixed left-4 z-20 grid transition-opacity duration-300 sm:left-8 max-md:top-[calc(4.5rem+env(safe-area-inset-top))] md:bottom-[calc(1.25rem+env(safe-area-inset-bottom))] ' + (hideStamp ? 'opacity-0' : 'opacity-100')}
        aria-live="polite"
      >
        <span className="timelapse-halo font-serif text-[1.65rem] leading-none text-prune-900 tabular-nums md:text-5xl">{months[cal.month]} {cal.year}</span>
        <span className="timelapse-halo font-hand text-xl text-prune-600 md:text-2xl">{stageLabel}</span>
      </div>

      <div className={'pointer-events-none fixed bottom-[18vh] right-6 top-[18vh] z-20 hidden w-16 transition-opacity duration-300 md:block ' + (stamp.past ? 'opacity-0' : '')} aria-hidden="true">
        <span className="absolute bottom-0 right-1.5 top-0 w-px bg-prune-900/25" />
        {MARKS.map((year) => (
          <span key={year} className="absolute right-4 -translate-y-1/2 text-xs text-loam-500 tabular-nums" style={{ top: `${threadPos(year)}%` }}>{2026 + year}</span>
        ))}
        <span className="absolute right-0.5 h-2.5 w-2.5 -translate-y-1/2 rounded-full bg-prune-600 shadow-[0_0_0_4px_rgb(91_87_129/0.2)]" style={{ top: `${threadPos(stamp.tau)}%` }} />
      </div>

      <div className="pointer-events-none relative z-10">
        {chapters.map((chapter, index) => (
          <section
            key={chapter.title}
            ref={(el) => { sectionsRef.current[index] = el }}
            className={'px-4 sm:px-12 ' + (index === 0 ? 'min-h-[135vh] pt-[57vh] md:pt-[20vh]' : index === chapters.length - 1 ? 'min-h-[150vh] pt-[58vh] md:pt-[26vh]' : 'min-h-[125vh] pt-[58vh] md:min-h-[135vh] md:pt-[26vh]')}
          >
            {index === 0 ? (
              <div className="pointer-events-auto grid max-w-2xl gap-5">
                <h1 className="timelapse-halo text-balance text-[2.2rem] font-medium leading-[0.98] text-prune-900 sm:text-6xl lg:text-[5.5rem]">
                  {chapter.title}
                </h1>
                <p className="timelapse-halo max-w-[34ch] text-lg text-loam-700">{chapter.body}</p>
                <p className="flex items-center gap-2.5 font-hand text-2xl text-prune-600">
                  <svg width="18" height="26" viewBox="0 0 18 26" aria-hidden="true" className="motion-safe:animate-bounce"><path d="M9 2v20M2 15l7 8 7-8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  {chapter.kicker}
                </p>
              </div>
            ) : (
              <div className="pointer-events-auto grid max-w-[420px] gap-2 rounded-md bg-loam-50/95 px-6 pb-6 pt-5 shadow-[0_1px_0_rgb(43_41_64/0.1),0_20px_40px_-26px_rgb(43_41_64/0.35)] max-md:max-w-none">
                <p className="font-hand text-2xl leading-tight text-leaf-600">{chapter.kicker}</p>
                <h2 className="text-balance text-[1.75rem] font-medium leading-[1.08] text-prune-900 sm:text-4xl">{chapter.title}</h2>
                <p className="text-pretty text-loam-500">{chapter.body}</p>
                {chapter.hint && <p className="font-hand text-[1.4rem] leading-tight text-prune-600">{chapter.hint}</p>}
                {index === chapters.length - 1 && children}
              </div>
            )}
          </section>
        ))}
      </div>
    </div>
  )
}

