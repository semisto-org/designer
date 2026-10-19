// The public view's years bar: a slider from the first planting to year 30,
// « Laisser pousser » to run the years one after the other, and the four
// seasons, today's chosen first. The crowns on the map follow it.
import clsx from 'clsx'
import { Pause, Sprout } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { track } from '@/lib/analytics'
import { t } from '@/lib/i18n'
import { calendarYear } from '@/relief/growth'
import { GARDEN_YEARS, SEASONS, type SeasonKey } from './garden'

/** How long « Laisser pousser » takes for one year (ms). */
const YEAR_MS = 600

export function GardenControls({ origin, today, growTo, season, onChange, className }: {
  origin: string
  /** Today, in years after year 0. */
  today: number
  /** On arrival the garden grows by itself from today up to this year (not with reduced motion). */
  growTo: number
  season: SeasonKey
  onChange: (year: number, season: SeasonKey) => void
  className?: string
}) {
  const [year, setYear] = useState(today)
  const [playing, setPlaying] = useState(false)
  const [stopAt, setStopAt] = useState(GARDEN_YEARS)
  const [chosenSeason, setChosenSeason] = useState(season)
  const moved = useRef(false)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => onChangeRef.current(year, chosenSeason), [year, chosenSeason])

  // The map grows before the visitor's eyes, once, a moment after arriving.
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || growTo <= today) return
    const timer = window.setTimeout(() => {
      if (moved.current) return
      setStopAt(growTo)
      setPlaying(true)
    }, 1200)
    return () => window.clearTimeout(timer)
  }, [growTo, today])

  useEffect(() => {
    if (!playing) return
    let frame = 0
    let last = performance.now()
    const step = (now: number) => {
      const dt = Math.min(100, now - last)
      last = now
      setYear((current) => {
        const next = Math.min(stopAt, current + dt / YEAR_MS)
        if (next >= stopAt) setPlaying(false)
        return next
      })
      frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [playing, stopAt])

  // The page did its work: the visitor looked at time (counted once).
  function looked(how: string) {
    if (moved.current) return
    moved.current = true
    track('public_map_slider', { how })
  }

  function toggle() {
    looked('play')
    if (playing) {
      setPlaying(false)
      setYear((y) => Math.round(y))
      return
    }
    if (year >= GARDEN_YEARS - 0.01) setYear(0)
    setStopAt(GARDEN_YEARS)
    setPlaying(true)
  }

  const shown = Math.round(year)
  const offset = Math.round(year - today)
  const relative = offset === 0 ? t('public_maps.garden.today')
    : offset > 0 ? t('public_maps.garden.in_years', { count: offset }) : t('public_maps.garden.years_ago', { count: -offset })
  const todayPct = (Math.min(GARDEN_YEARS, today) / GARDEN_YEARS) * 100

  return (
    <section aria-label={t('public_maps.garden.title')} className={clsx('z-10 rounded-2xl bg-white/95 p-3 shadow-lg ring-1 ring-loam-200 backdrop-blur', className)}>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={toggle}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-leaf-600 text-white shadow-sm hover:bg-leaf-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-prune-600"
          aria-label={playing ? t('public_maps.garden.pause') : t('public_maps.garden.play')}
          title={playing ? t('public_maps.garden.pause') : t('public_maps.garden.play')}
        >
          {playing ? <Pause className="h-5 w-5" /> : <Sprout className="h-5 w-5" />}
        </button>
        <div className="w-24 shrink-0">
          <p className="font-serif text-xl leading-tight text-loam-900 tabular-nums">{calendarYear(origin, shown)}</p>
          <p className="text-sm leading-tight text-loam-500">{relative}</p>
        </div>
        <div className="relative min-w-0 flex-1">
          <input
            type="range"
            min={0}
            max={GARDEN_YEARS}
            step={1}
            value={shown}
            onChange={(event) => {
              looked('slider')
              setPlaying(false)
              setYear(Number(event.target.value))
            }}
            aria-label={t('public_maps.garden.slider')}
            aria-valuetext={`${calendarYear(origin, shown)}, ${relative}`}
            className="h-2 w-full cursor-pointer accent-leaf-600"
          />
          {today > 0.05 && (
            <span
              className="pointer-events-none absolute top-0 h-3 w-0.5 -translate-x-1/2 rounded bg-prune-500"
              style={{ left: `calc(0.5rem + (100% - 1rem) * ${todayPct / 100})` }}
              title={t('public_maps.garden.today')}
            />
          )}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-1" role="radiogroup" aria-label={t('public_maps.garden.season')}>
        {(Object.keys(SEASONS) as SeasonKey[]).map((key) => (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={chosenSeason === key}
            onClick={() => {
              looked('season')
              setChosenSeason(key)
            }}
            className={clsx('rounded-full px-3 py-1 text-sm transition', chosenSeason === key ? 'bg-prune-700 text-white' : 'bg-loam-100 text-loam-700 hover:bg-loam-200')}
          >
            {t(`public_maps.garden.seasons.${key}`)}
          </button>
        ))}
      </div>
      <p className="mt-2 hidden text-sm text-loam-500 md:block">{t('public_maps.garden.hint')}</p>
    </section>
  )
}
