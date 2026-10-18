// The map's plants growing on the relief page: the year bar over the scene
// (a slider from planting to year 20, « Laisser pousser »), the panel
// section (show them, strata colours, walk at eye level), the card of a
// plant touched and the touch pad to walk.
import clsx from 'clsx'
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Footprints, Pause, Sprout, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/Button'
import { t } from '@/lib/i18n'
import type { PlantInfo, WalkMode } from './controller.ts'
import { formatNumber } from './format.ts'
import { GROWTH_YEARS, calendarYear } from './growth.ts'
import type { WalkKey } from './scene.ts'
import { SectionTitle, Toggle } from './ui.tsx'

/** How long « Laisser pousser » takes for one year (ms). */
const YEAR_MS = 900

/**
 * The year on the slider and the year shown: moving the slider lets the
 * plants grow (or shrink back) over a moment instead of jumping, and
 * « Laisser pousser » runs the years one after the other up to year 20.
 * `apply` receives the shown year, fractional while it moves.
 */
export function useGrowthYear(initial: number, apply: (year: number) => void) {
  const [target, setTarget] = useState(initial)
  const [playing, setPlaying] = useState(false)
  const [shown, setShown] = useState(initial)
  const current = useRef(initial)
  const applyRef = useRef(apply)
  applyRef.current = apply

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let frame = 0
    let last = performance.now()
    const step = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      let next: number
      if (playing) {
        next = Math.min(GROWTH_YEARS, current.current + (dt * 1000) / YEAR_MS)
      } else {
        const gap = target - current.current
        next = reduce || Math.abs(gap) < 0.01 ? target : current.current + gap * (1 - Math.pow(0.004, dt))
      }
      if (next !== current.current) {
        current.current = next
        applyRef.current(next)
        setShown(next)
      }
      if (playing && next >= GROWTH_YEARS) {
        setPlaying(false)
        setTarget(GROWTH_YEARS)
        return
      }
      if (playing || next !== target) frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [target, playing])

  const set = useCallback((year: number) => {
    setPlaying(false)
    setTarget(year)
  }, [])

  const toggle = useCallback(() => {
    if (playing) {
      setPlaying(false)
      setTarget(Math.round(current.current))
      return
    }
    if (current.current >= GROWTH_YEARS - 0.01) {
      current.current = 0
      applyRef.current(0)
      setShown(0)
    }
    setPlaying(true)
  }, [playing])

  return { target: playing ? Math.floor(shown) : target, shown, playing, set, toggle }
}

/** The years bar over the scene. */
export function GrowthBar({ year, shown, playing, today, origin, onYear, onToggle, className }: {
  year: number
  shown: number
  playing: boolean
  /** Today, in years after year 0. */
  today: number
  origin: string
  onYear: (year: number) => void
  onToggle: () => void
  className?: string
}) {
  const label = playing ? Math.floor(shown + 0.001) : year
  const todayPct = (Math.min(GROWTH_YEARS, today) / GROWTH_YEARS) * 100
  return (
    <div className={clsx('z-20 flex items-center gap-3 rounded-2xl border border-loam-200 bg-white/95 px-3 py-2 shadow-lg backdrop-blur', className)}>
      <button
        type="button"
        onClick={onToggle}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-leaf-600 text-white shadow-sm hover:bg-leaf-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-prune-600"
        aria-label={playing ? t('relief.page.growth.pause') : t('relief.page.growth.play')}
        title={playing ? t('relief.page.growth.pause') : t('relief.page.growth.play')}
      >
        {playing ? <Pause className="h-5 w-5" /> : <Sprout className="h-5 w-5" />}
      </button>
      <div className="w-24 shrink-0 sm:w-32">
        <p className="font-serif text-lg leading-tight text-loam-900 tabular-nums">
          {t('relief.page.growth.year', { year: label })}
        </p>
        <p className="text-sm leading-tight text-loam-500">
          {label === 0 ? t('relief.page.growth.planting', { year: calendarYear(origin, 0) }) : t('relief.page.growth.calendar', { year: calendarYear(origin, label) })}
        </p>
      </div>
      <div className="relative min-w-0 flex-1 pt-1">
        <input
          type="range"
          min={0}
          max={GROWTH_YEARS}
          step={1}
          value={year}
          onChange={(event) => onYear(Number(event.target.value))}
          aria-label={t('relief.page.growth.slider')}
          aria-valuetext={t('relief.page.growth.year', { year })}
          className="h-2 w-full cursor-pointer accent-leaf-600"
        />
        <div className="relative mx-2 mt-0.5 h-5 text-sm text-loam-400" aria-hidden="true">
          {[0, 5, 10, 15, 20].map((tick) => (
            <span key={tick} className="absolute -translate-x-1/2 tabular-nums" style={{ left: `${(tick / GROWTH_YEARS) * 100}%` }}>{tick}</span>
          ))}
        </div>
        {today > 0.05 && (
          <span
            className="pointer-events-none absolute top-0 h-3 w-0.5 -translate-x-1/2 rounded bg-prune-500"
            style={{ left: `calc(0.5rem + (100% - 1rem) * ${todayPct / 100})` }}
            title={t('relief.page.growth.today')}
          />
        )}
      </div>
    </div>
  )
}

/** The panel section of the « Vue » tab: the plants and the walk. */
export function GrowthSection({ count, patches, plantsOn, strataColors, walk, touch, onPlants, onStrataColors, onWalk, onMoveWalker }: {
  count: number
  patches: boolean
  plantsOn: boolean
  strataColors: boolean
  walk: WalkMode
  touch: boolean
  onPlants: (on: boolean) => void
  onStrataColors: (on: boolean) => void
  onWalk: () => void
  onMoveWalker: () => void
}) {
  return (
    <div className="space-y-3 border-t border-loam-100 pt-3">
      {count > 0 && (
        <div className="space-y-2">
          <SectionTitle>{t('relief.page.growth.title')}</SectionTitle>
          <p className="text-sm text-loam-600">{t('relief.page.growth.intro')}</p>
          <Toggle checked={plantsOn} onChange={onPlants} label={t('relief.page.growth.show')} hint={t('relief.page.growth.count', { count })} />
          <Toggle checked={strataColors} onChange={onStrataColors} label={t('relief.page.growth.strata_colors')} hint={t('relief.page.growth.strata_colors_hint')} />
          <p className="text-sm text-loam-500">{t('relief.page.growth.indicative')}</p>
          {patches && <p className="text-sm text-loam-500">{t('relief.page.growth.patch_note')}</p>}
        </div>
      )}
      <div className="space-y-2">
        <SectionTitle>{t('relief.page.walk.title')}</SectionTitle>
        <p className="text-sm text-loam-600">{t('relief.page.walk.intro')}</p>
        <div className="flex flex-wrap gap-2">
          <Button variant={walk === 'off' ? 'secondary' : 'primary'} size="sm" className="flex-1 whitespace-nowrap text-sm" onClick={onWalk} aria-pressed={walk !== 'off'}>
            <Footprints className="h-4 w-4" />
            {walk === 'off' ? t('relief.page.walk.start') : t('relief.page.walk.stop')}
          </Button>
          {walk === 'walking' && (
            <Button variant="secondary" size="sm" className="whitespace-nowrap text-sm" onClick={onMoveWalker}>
              {t('relief.page.walk.move')}
            </Button>
          )}
        </div>
        {walk === 'placing' && <p className="text-sm font-medium text-prune-700">{t(touch ? 'relief.page.walk.placing_touch' : 'relief.page.walk.placing')}</p>}
        {walk === 'walking' && <p className="text-sm text-loam-500">{t(touch ? 'relief.page.walk.keys_touch' : 'relief.page.walk.keys')}</p>}
      </div>
    </div>
  )
}

/** What a plant touched in 3D is, and its size at the year shown. */
export function PlantCard({ info, onClose }: { info: PlantInfo; onClose: () => void }) {
  const m = (value: number) => formatNumber(value, value < 10 ? 1 : 0)
  const title = [info.number != null ? String(info.number) : null, info.ownName ?? info.name ?? t(`plants.strata.${info.strata}`)].filter(Boolean).join(' · ')
  return (
    <div
      className={clsx(
        'absolute z-30 space-y-1 rounded-2xl border border-loam-200 bg-white/95 p-3 pr-9 text-sm text-loam-600 shadow-lg backdrop-blur',
        'inset-x-3 top-3 sm:inset-x-auto sm:bottom-28 sm:right-3 sm:top-auto sm:max-w-xs',
      )}
      aria-live="polite"
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute right-1.5 top-1.5 rounded-md p-1 text-loam-400 hover:bg-loam-100 hover:text-loam-700"
        aria-label={t('relief.page.growth.card.close')}
      >
        <X className="h-4 w-4" />
      </button>
      <p className="font-semibold text-loam-900">{title}</p>
      {info.ownName && info.name && <p className="text-loam-500">{info.name}</p>}
      {info.latinName && <p className="text-loam-500">{info.latinName}</p>}
      {info.patchName && <p className="text-loam-500">{info.patchName}</p>}
      <p>{info.ownName || info.name ? `${t(`plants.strata.${info.strata}`)} · ` : ''}{info.longAgo ? t('relief.page.growth.card.planted_long_ago') : t(info.planted ? 'relief.page.growth.card.planted_in' : 'relief.page.growth.card.planned_in', { year: info.plantedYear })}</p>
      {info.height != null && info.spread != null ? (
        <p className="font-medium text-leaf-800">
          {t('relief.page.growth.card.now', { year: info.yearCalendar, height: m(info.height), spread: m(info.spread) })}
        </p>
      ) : (
        <p className="font-medium text-loam-700">{t('relief.page.growth.card.not_yet', { year: info.yearCalendar })}</p>
      )}
      {info.training === 'free' ? (
        <p>{t('relief.page.growth.card.adult', { height: m(info.adultHeight), spread: m(info.adultSpread), years: info.maturityYears })}</p>
      ) : (
        <p>{t(`relief.page.growth.card.${info.training}`, { height: m(info.adultHeight), spread: m(info.adultSpread) })}</p>
      )}
      {info.graft && (
        <p>{t('relief.page.growth.card.graft', {
          details: [
            info.graft.form && t(`plant_feature.graft_form_names.${info.graft.form}`),
            t('relief.page.growth.card.trunk', { value: m(info.graft.trunk) }),
            t('relief.page.growth.card.vigor', { value: t(`plant_feature.vigor_names.${info.graft.vigor}`) }),
            info.graft.rootstock,
          ].filter(Boolean).join(', '),
        })}</p>
      )}
      {info.indicative && <p className="text-loam-400">{t('relief.page.growth.card.indicative')}</p>}
    </div>
  )
}

/** On a touch screen: hold an arrow to walk or turn. */
export function WalkPad({ onKey, raised }: { onKey: (key: WalkKey, down: boolean) => void; raised: boolean }) {
  const pad = (key: WalkKey, icon: ReactNode) => (
    <button
      type="button"
      aria-label={t(`relief.page.walk.pad.${key}`)}
      className="flex h-12 w-12 select-none items-center justify-center rounded-full bg-white/85 text-loam-800 shadow-md active:bg-leaf-100"
      onPointerDown={(event) => { event.preventDefault(); onKey(key, true) }}
      onPointerUp={() => onKey(key, false)}
      onPointerLeave={() => onKey(key, false)}
      onPointerCancel={() => onKey(key, false)}
      onContextMenu={(event) => event.preventDefault()}
    >
      {icon}
    </button>
  )
  return (
    <div className={clsx(
      'absolute inset-x-3 z-10 flex items-end justify-between sm:bottom-24 sm:left-auto sm:right-6 sm:gap-6',
      // Above the years bar, itself above the settings sheet.
      raised ? 'bottom-[calc(60dvh+0.75rem)]' : 'bottom-[calc(10rem+env(safe-area-inset-bottom))]',
    )}>
      <div className="flex gap-2">
        {pad('left', <ArrowLeft className="h-5 w-5" />)}
        {pad('right', <ArrowRight className="h-5 w-5" />)}
      </div>
      <div className="flex flex-col items-center gap-2">
        {pad('up', <ArrowUp className="h-5 w-5" />)}
        {pad('down', <ArrowDown className="h-5 w-5" />)}
      </div>
    </div>
  )
}
