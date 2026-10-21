import { Link } from '@inertiajs/react'
import { ArrowRight } from 'lucide-react'
import clsx from 'clsx'
import { useEffect, useMemo, useRef, useState } from 'react'
import { content, tf } from '@/lib/content'
import { formatArea, formatLength, t } from '@/lib/i18n'
import { loadAtlases } from '@/public_maps/gardenLayer'
import type { PublicMapProps } from '@/types/collab'
import { TourPainter, type TourLabels } from './paint'
import { factsOf, progressAt, sceneAt, sceneOf, type Facts, type NoteKey, type Scene, type TourFeature } from './scene'

export type TourMap = PublicMapProps & { path: string }

type Station = { scene: string; kicker: string; title: string; body: string; plan?: string; link?: string; link_label?: string }
type Chapter = { id: string; number: string; title: string; intro: string; stations: Station[] }

/** The canvas's words, filled in with what was measured on this map. */
function labelsFor(facts: Facts): TourLabels {
  const count = (n: number) => new Intl.NumberFormat('fr-BE').format(n)
  const key = (name: string, plain: boolean) => `site.features.canvas.${name}${plain ? '_plain' : ''}`
  const labels: Partial<TourLabels> = { north: tf('site.features.canvas.north') }
  const notes: Record<NoteKey, string> = {
    area: facts.areaM2 ? tf(key('area', false), { area: formatArea(facts.areaM2) }) : '',
    sun: tf(key('sun', false)),
    wind: tf(key('wind', false)),
    existing: facts.buildings && facts.hedgesM > 20
      ? tf(key('existing', false), { buildings: count(facts.buildings), hedges: formatLength(Math.round(facts.hedgesM / 10) * 10) })
      : tf(key('existing', true)),
    water: facts.pond && facts.ponds > 1
      ? tf(key('water', false), { ponds: count(facts.ponds), pond: formatArea(facts.pond.areaM2) })
      : tf(key('water', true)),
    draft: tf(key('draft', false)),
    plants: facts.plants && facts.species
      ? tf(key('plants', false), { plants: count(facts.plants), species: count(facts.species) })
      : tf(key('plants', true)),
    comment: tf(key('comment', false)),
  }
  return { ...labels, ...notes } as TourLabels
}

/**
 * « Fonctionnalités » as the visit of a real notebook: the published map
 * Semisto chose stays on screen while the visit scrolls by, and fills in
 * station after station, in the order of the method (observe, map, design,
 * plant, then share). Each station is a tool, shown when it serves.
 */
export function Tour({ map }: { map: TourMap | null }) {
  const chapters = content<Chapter[]>('site.features.chapters')
  const stations = useMemo(() => chapters.flatMap((chapter) => chapter.stations.map((station) => ({ ...station, chapter: chapter.id }))), [chapters])
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stationRefs = useRef<(HTMLElement | null)[]>([])
  const [active, setActive] = useState({ chapter: chapters[0]?.id, station: 0 })
  // The garden's year, while the plants are on the page: the time of living things.
  const [stamp, setStamp] = useState<{ year: number; ahead: number } | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!map || !canvas || !ctx) return
    const features = map.features.features as TourFeature[]
    const facts = factsOf(features, map.map.areaM2, map.growth)
    const painter = new TourPainter(ctx, map, facts, labelsFor(facts))
    const scenes: Scene[] = stations.map((station) => sceneOf(station.scene))
    const spans = scenes.map((scene) => scene.span)
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let alive = true
    let frame = 0
    let tops: number[] = []
    let width = 0
    let height = 0
    let dpr = 1
    let compact = false
    let shown: Scene | null = null
    let last = performance.now()
    let lastActive = ''
    let lastStamp = ''

    const measure = () => {
      tops = stationRefs.current.map((el) => (el ? el.getBoundingClientRect().top + window.scrollY : 0))
    }
    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      dpr = Math.min(2, window.devicePixelRatio || 1)
      width = rect.width
      height = rect.height
      compact = width < 640
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      measure()
    }
    const target = () => {
      const line = window.scrollY + window.innerHeight * (compact ? 0.72 : 0.55)
      const { index, t } = progressAt(tops, line, spans)
      return { scene: sceneAt(scenes, index, t), index }
    }
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const goal = target()
      // The drawing eases towards the scroll, like the wind rather than a switch.
      const ease = reduce || !shown ? 1 : 1 - Math.pow(0.002, dt)
      const from: Scene = shown ?? goal.scene
      const next = { ...goal.scene } as Scene
      for (const k of ['outline', 'compass', 'existing', 'water', 'access', 'structures', 'drafts', 'plants', 'comments', 'focus', 'year'] as const) {
        next[k] = from[k] + (goal.scene[k] - from[k]) * ease
      }
      shown = next
      painter.draw(shown, width, height, dpr, compact)
      const station = stations[goal.index]
      const activeKey = `${station?.chapter}-${goal.index}`
      if (activeKey !== lastActive) {
        lastActive = activeKey
        setActive({ chapter: station?.chapter, station: goal.index })
      }
      const stampKey = shown.plants > 0.5 ? `${painter.calendarYearOf(shown)}-${Math.round(shown.year)}` : ''
      if (stampKey !== lastStamp) {
        lastStamp = stampKey
        setStamp(shown.plants > 0.5 ? { year: painter.calendarYearOf(shown), ahead: Math.round(shown.year) } : null)
      }
      const settled = (['outline', 'compass', 'existing', 'water', 'access', 'structures', 'drafts', 'plants', 'comments', 'focus'] as const)
        .every((k) => Math.abs(goal.scene[k] - next[k]) < 0.002) && Math.abs(goal.scene.year - next.year) < 0.01
      frame = settled ? 0 : requestAnimationFrame(loop)
    }
    const wake = () => {
      if (frame || !alive) return
      last = performance.now()
      frame = requestAnimationFrame(loop)
    }
    const onResize = () => {
      resize()
      painter.draw(shown ?? target().scene, width, height, dpr, compact)
      wake()
    }

    resize()
    loadAtlases().then((atlases) => {
      if (!alive) return
      painter.setAtlases(atlases)
      wake()
    }, () => {})
    window.addEventListener('resize', onResize)
    window.addEventListener('scroll', wake, { passive: true })
    void document.fonts?.ready.then(() => {
      if (!alive) return
      measure()
      painter.draw(shown ?? target().scene, width, height, dpr, compact)
      wake()
    })
    frame = requestAnimationFrame(loop)
    return () => {
      alive = false
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('scroll', wake)
    }
  }, [map, stations])

  let stationIndex = -1
  const place = map ? map.map.locality || map.map.regionName : null

  return (
    <div className={clsx('relative', map && 'lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]')}>
      {map && (
        <div className="sticky top-0 z-20 h-[48svh] border-b border-loam-200 bg-loam-50 lg:z-0 lg:order-2 lg:h-dvh lg:border-b-0 lg:border-l">
          <canvas ref={canvasRef} className="block h-full w-full" role="img" aria-label={map.title} />
          <StepRail chapters={chapters} active={active.chapter} />
          <div className={clsx('pointer-events-none absolute bottom-3 left-4 grid transition-opacity duration-500 lg:bottom-5 lg:left-6', stamp ? 'opacity-100' : 'opacity-0')} aria-live="polite">
            {stamp && (
              <>
                <span className="timelapse-halo font-serif text-3xl font-semibold leading-none text-prune-900 tabular-nums lg:text-5xl">{stamp.year}</span>
                <span className="timelapse-halo font-hand text-xl text-prune-600 lg:text-2xl">
                  {stamp.ahead <= 0 ? tf('site.features.stamp.now') : t('site.features.stamp.later', { count: stamp.ahead })}
                </span>
              </>
            )}
          </div>
          <div className="pointer-events-none absolute bottom-3 right-4 hidden text-right lg:block">
            <p className="font-serif text-xl font-semibold text-prune-900">{map.title}</p>
            {(map.map.areaM2 || place) && (
              <p className="text-sm text-loam-500">{[map.map.areaM2 ? formatArea(map.map.areaM2) : null, place].filter(Boolean).join(' · ')}</p>
            )}
            <Link href={map.path} className="pointer-events-auto mt-1 inline-flex items-center gap-1.5 text-sm font-medium text-prune-600 hover:text-prune-800">
              {tf('site.features.hero.open')}
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </div>
        </div>
      )}

      <div className="relative z-10 lg:order-1">
        {chapters.map((chapter) => (
          <section key={chapter.id} id={chapter.id} aria-labelledby={`${chapter.id}-title`} className="scroll-mt-4 px-4 sm:px-8 lg:pl-[max(1rem,calc((100vw-72rem)/2+1rem))] lg:pr-10">
            <header className="pb-4 pt-16 sm:pt-24">
              <p className="flex items-baseline gap-3">
                {chapter.number && <span className="font-serif text-5xl font-semibold leading-none text-prune-200 tabular-nums sm:text-6xl">{chapter.number}</span>}
                <span className="font-hand text-2xl text-leaf-600">{chapter.number ? tf('site.features.step', { number: chapter.number }) : chapter.title}</span>
              </p>
              <h2 id={`${chapter.id}-title`} className="mt-2 text-balance font-serif text-3xl font-medium leading-tight text-prune-900 sm:text-4xl">{chapter.title}</h2>
              <p className="mt-2 max-w-md text-pretty text-lg text-loam-500">{chapter.intro}</p>
            </header>
            <ol className="grid">
              {chapter.stations.map((station) => {
                stationIndex += 1
                const index = stationIndex
                return (
                  <li
                    key={station.title}
                    ref={(el) => { stationRefs.current[index] = el }}
                    className={clsx(
                      'flex flex-col justify-center py-10 transition-opacity duration-500',
                      map && 'lg:min-h-[78vh] max-lg:min-h-[62svh]',
                      map && active.station !== index && 'lg:opacity-45',
                    )}
                  >
                    <StationNote station={station} />
                  </li>
                )
              })}
            </ol>
          </section>
        ))}
        <div className={clsx(map && 'h-[30vh]')} aria-hidden="true" />
      </div>
    </div>
  )
}

function StationNote({ station }: { station: Station }) {
  return (
    <div className="max-w-md rounded-md bg-loam-50/95 lg:bg-transparent">
      <p className="font-hand text-2xl leading-tight text-leaf-600">{station.kicker}</p>
      <h3 className="mt-1 text-balance font-serif text-2xl font-medium leading-snug text-prune-900 sm:text-[1.75rem]">{station.title}</h3>
      <p className="mt-3 text-pretty leading-relaxed text-loam-600">{station.body}</p>
      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
        {station.link && (
          <Link href={station.link} className="inline-flex items-center gap-1.5 text-sm font-medium text-prune-600 hover:text-prune-800">
            {station.link_label}
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        )}
        {station.plan && <span className="rounded-full bg-humus-100 px-2.5 py-0.5 text-sm font-medium text-humus-700">{tf('site.features.with_plan')}</span>}
      </div>
    </div>
  )
}

/** The four steps of the journey over the drawing, the current one marked. */
function StepRail({ chapters, active }: { chapters: Chapter[]; active: string | undefined }) {
  return (
    <nav aria-label={tf('site.features.hero.kicker')} className="absolute inset-x-0 top-0 flex justify-center px-3 pt-3">
      <ol className="flex max-w-full gap-1 overflow-x-auto rounded-full bg-loam-50/90 p-1 shadow-sm ring-1 ring-loam-900/5">
        {chapters.map((chapter) => (
          <li key={chapter.id}>
            <a
              href={`#${chapter.id}`}
              aria-current={chapter.id === active ? 'step' : undefined}
              className={clsx(
                'flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1 text-sm font-medium transition-colors',
                chapter.id === active ? 'bg-prune-600 text-white' : 'text-loam-600 hover:bg-loam-100',
              )}
            >
              {chapter.number && <span className="tabular-nums opacity-70">{chapter.number}</span>}
              {/* On a phone, only the current step says its name. */}
              <span className={clsx(chapter.number && chapter.id !== active && 'max-sm:sr-only')}>{chapter.title}</span>
            </a>
          </li>
        ))}
      </ol>
    </nav>
  )
}
