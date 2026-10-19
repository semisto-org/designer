import { Head, Link } from '@inertiajs/react'
import clsx from 'clsx'
import { ArrowLeft, Car, CloudRain, Footprints, Loader2, MoonStar, Pause, Play, RotateCcw, SunMedium, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { track } from '@/lib/analytics'
import { t } from '@/lib/i18n'
import { LAYER_COLORS } from '@/map/layers/features'
import { STRATA_COLORS } from '@/map/plants/strataColors'
import { NIGHT_LENGTH, nightClock } from '@/relief/coldAir'
import { Compass } from '@/relief/Compass'
import {
  ReliefController, type LoadingStep, type NivaInfo, type NivaKey, type PlantInfo, type RainStats, type SunDate, type SunInfo, type WalkMode,
} from '@/relief/controller'
import { formatClock, formatDepth, formatDuration, formatNumber, formatVolume } from '@/relief/format'
import { GrowthBar, PlantCard, WalkPad, useGrowthYear } from '@/relief/GrowthControls'
import { GROWTH_YEARS, yearsBetween, type GrowingPlantsData } from '@/relief/growth'
import { NivaDashboard, NivaPad } from '@/relief/NivaControls'
import type { OverlayFeature } from '@/relief/overlay'
import type { WalkKey } from '@/relief/scene'
import { ChoiceGroup, Slider } from '@/relief/ui'
import type { MultiPolygon } from 'geojson'
import type { LandcoverClassData, SoilModel, TerrainGridData } from '@/types/relief'

type Props = {
  title: string
  path: string
  boundary: MultiPolygon | null
  terrain: TerrainGridData
  features: OverlayFeature[]
  growingPlants: GrowingPlantsData
  timezone: string
  location: [number, number] | null
  landcoverClasses: Record<string, LandcoverClassData>
  soilModel: SoilModel
  buildingsUrl: string | null
}

/** What the visitor is looking at: the four simulations, or the terrain alone. */
type Mode = 'rain' | 'night' | 'shade' | 'tour'

const MODES = [
  { key: 'rain', Icon: CloudRain },
  { key: 'night', Icon: MoonStar },
  { key: 'shade', Icon: SunMedium },
  { key: 'tour', Icon: Footprints },
] as const

const INTENSITIES = [{ value: 10, key: 'light' }, { value: 30, key: 'heavy' }, { value: 60, key: 'storm' }] as const
const SHADE_DATES: SunDate[] = ['winter', 'equinox', 'summer']
/** The night slider moves by 10 minutes. */
const NIGHT_STEPS = NIGHT_LENGTH / 10

function isCompact() {
  return typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches
}

/**
 * The simplified 3D view of a published map: the place's relief with its
 * published elements and plants, and four things to try without settings —
 * a downpour, a clear night, the shade of a day, a walk or a drive. The
 * editor's relief page (maps/reliefs/show) keeps the full analyses.
 */
export default function PublicRelief(props: Props) {
  const { terrain, growingPlants } = props
  const container = useRef<HTMLDivElement>(null)
  const controller = useRef<ReliefController | null>(null)
  const pointer = useRef<[number, number] | null>(null)
  const [loading, setLoading] = useState<LoadingStep | 'failed' | 'webgl'>('download')
  const [ready, setReady] = useState(false)
  const [mode, setMode] = useState<Mode | null>(null)
  const [plantCount, setPlantCount] = useState(0)
  const [plantInfo, setPlantInfo] = useState<PlantInfo | null>(null)
  // Rain
  const [intensity, setIntensity] = useState(30)
  const [playing, setPlaying] = useState(false)
  const [stats, setStats] = useState<RainStats | null>(null)
  // Night
  const [night, setNight] = useState(0)
  const [nightRunning, setNightRunning] = useState(false)
  const [coldPeak, setColdPeak] = useState(0)
  // Shade
  const [sunDate, setSunDate] = useState<SunDate>('summer')
  const [minutes, setMinutes] = useState(9 * 60)
  const [dayRunning, setDayRunning] = useState(false)
  const [sunInfo, setSunInfo] = useState<SunInfo>({ mode: 'off' })
  // Walk and drive
  const [walk, setWalk] = useState<WalkMode>('off')
  const [niva, setNiva] = useState<NivaInfo>({ mode: 'off' })
  const [attribution, setAttribution] = useState<string | null>(null)
  const touch = useMemo(() => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches, [])

  const plantToday = useMemo(
    () => Math.min(GROWTH_YEARS, Math.max(0, yearsBetween(growingPlants.origin, growingPlants.today))),
    [growingPlants.origin, growingPlants.today],
  )
  const growth = useGrowthYear(Math.round(plantToday), (year) => controller.current?.setPlantYear(year))

  useEffect(() => {
    track('public_map_3d', {})
    if (!container.current) return
    const instance = new ReliefController({
      container: container.current,
      terrain,
      features: props.features,
      boundary: props.boundary,
      landcoverClasses: props.landcoverClasses,
      soil: props.soilModel,
      location: props.location,
      timezone: props.timezone,
      layerColors: LAYER_COLORS,
      buildingsUrl: props.buildingsUrl,
      growingPlants,
      strataColors: STRATA_COLORS,
      compact: isCompact(),
      onWalk: (next) => {
        setWalk(next)
        if (next !== 'off') setPlantInfo(null)
      },
      onBuildings: (info) => setAttribution(info.attribution),
      onLoading: (step) => setLoading(step),
      onStats: setStats,
      onSun: setSunInfo,
      onNiva: setNiva,
    })
    controller.current = instance
    instance.load().then(() => {
      if (instance.disposed) return
      // Water, elements and plants: the published plan, without the analysis lines.
      instance.setOverlay({ axes: false, hollows: false })
      setPlantCount(instance.plants.length)
      setReady(true)
    }).catch((error: unknown) => {
      if (instance.disposed) return
      console.error(error)
      setLoading(/webgl/i.test(String(error)) ? 'webgl' : 'failed')
    })
    return () => {
      instance.dispose()
      if (controller.current === instance) controller.current = null
    }
    // The page mounts once per terrain version.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terrain.version])

  // ---- Leaving a mode puts the scene back as it was.
  const leave = useCallback((current: Mode | null) => {
    const c = controller.current
    if (!c) return
    if (current === 'rain' && c.playing) {
      c.pause()
      setPlaying(false)
    }
    if (current === 'night') {
      setNightRunning(false)
      c.setColdAir(false)
    }
    if (current === 'shade') {
      setDayRunning(false)
      void c.setSun({ mode: 'off' })
    }
    if (current === 'tour') {
      if (c.walkMode !== 'off') c.stopWalk()
      if (c.niva || c.nivaPlacing) c.parkNiva()
    }
  }, [])

  function choose(next: Mode) {
    const c = controller.current
    if (!c) return
    leave(mode)
    if (next === mode) return setMode(null)
    setMode(next)
    track('public_map_3d_mode', { mode: next })
    if (next === 'night') {
      c.setColdAir(true)
      c.setColdNight(night)
      setColdPeak(c.coldPeak())
    }
    if (next === 'shade') {
      const window = c.sunWindow(sunDate)
      const start = Math.min(window.max, Math.max(window.min, minutes))
      setMinutes(start)
      void c.setSun({ mode: 'instant', date: sunDate, minutes: start })
    }
  }

  // ---- Rain
  function toggleRain() {
    const c = controller.current
    if (!c) return
    if (playing) c.pause()
    else c.play()
    setPlaying(c.playing)
  }

  function resetRain() {
    controller.current?.resetRain()
    setPlaying(false)
    setStats(controller.current?.stats() ?? null)
  }

  function chooseIntensity(value: number) {
    setIntensity(value)
    controller.current?.setRain({ intensity: value })
  }

  // ---- Night: 21:00 to dawn in about twenty seconds.
  const updateNight = useCallback((value: number) => {
    setNight(value)
    controller.current?.setColdNight(value)
    setColdPeak(controller.current?.coldPeak() ?? 0)
  }, [])

  useEffect(() => {
    if (!nightRunning) return
    const timer = setInterval(() => {
      setNight((current) => {
        const next = Math.round(current * NIGHT_STEPS + 1) / NIGHT_STEPS
        if (next > 1) {
          setNightRunning(false)
          return current
        }
        controller.current?.setColdNight(next)
        setColdPeak(controller.current?.coldPeak() ?? 0)
        return next
      })
    }, 330)
    return () => clearInterval(timer)
  }, [nightRunning])

  function toggleNight() {
    if (nightRunning) return setNightRunning(false)
    if (night >= 1) updateNight(0)
    setNightRunning(true)
  }

  // ---- Shade: the hour slider coalesces to the latest value.
  const sunQueue = useRef<{ busy: boolean; pending: number | null }>({ busy: false, pending: null })
  const applyMinutes = useCallback(async (value: number) => {
    const queue = sunQueue.current
    queue.pending = value
    if (queue.busy) return
    queue.busy = true
    while (queue.pending != null) {
      const next = queue.pending
      queue.pending = null
      await controller.current?.setSun({ minutes: next })
    }
    queue.busy = false
  }, [])

  const sunWindow = useMemo(
    () => (ready && controller.current ? controller.current.sunWindow(sunDate) : { min: 300, max: 1320 }),
    [ready, sunDate],
  )

  function chooseDate(date: SunDate) {
    const c = controller.current
    if (!c) return
    const window = c.sunWindow(date)
    const next = Math.min(window.max, Math.max(window.min, minutes))
    setSunDate(date)
    setMinutes(next)
    void c.setSun({ mode: 'instant', date, minutes: next })
  }

  function chooseMinutes(value: number) {
    setDayRunning(false)
    setMinutes(value)
    void applyMinutes(value)
  }

  useEffect(() => {
    if (!dayRunning) return
    const timer = setInterval(() => {
      setMinutes((current) => {
        const next = current + 10
        if (next > sunWindow.max) {
          setDayRunning(false)
          return current
        }
        void applyMinutes(next)
        return next
      })
    }, 140)
    return () => clearInterval(timer)
  }, [dayRunning, sunWindow.max, applyMinutes])

  function toggleDay() {
    if (dayRunning) return setDayRunning(false)
    if (minutes >= sunWindow.max - 10) chooseMinutes(sunWindow.min)
    setDayRunning(true)
  }

  // ---- Walk and drive: arrows (or W A S D / Z Q S D), Shift runs, space
  // brakes, Escape comes back to the overview.
  const walking = walk === 'walking'
  const driving = niva.mode === 'driving'
  useEffect(() => {
    if (walk === 'off' && niva.mode === 'off') return
    const keys: Record<string, WalkKey | NivaKey> = {
      ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
      ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
      ShiftLeft: 'run', ShiftRight: 'run', Space: 'brake',
    }
    const onKey = (event: KeyboardEvent) => {
      const c = controller.current
      if (!c) return
      const down = event.type === 'keydown'
      if (down && event.code === 'Escape') {
        if (c.walkMode !== 'off') c.stopWalk()
        if (c.niva || c.nivaPlacing) c.parkNiva()
        return
      }
      const key = keys[event.code]
      if (!key) return
      if (c.niva && key !== 'run') {
        event.preventDefault()
        c.setNivaKey(key as NivaKey, down)
      } else if (c.walkMode === 'walking' && key !== 'brake') {
        event.preventDefault()
        c.setWalkKey(key as WalkKey, down)
      }
    }
    const onBlur = () => {
      controller.current?.resetWalkKeys()
      controller.current?.resetNivaInput()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKey)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onKey)
      window.removeEventListener('blur', onBlur)
    }
  }, [walk, niva.mode])

  function startWalk() {
    const c = controller.current
    if (!c) return
    if (c.niva || c.nivaPlacing) c.parkNiva()
    c.toggleWalk()
  }

  function startDrive() {
    const c = controller.current
    if (!c) return
    if (c.walkMode !== 'off') c.stopWalk()
    c.toggleNiva()
  }

  // ---- A click (not a drag): sets the walker or the Niva down, else names a plant.
  function onPointerUp(event: React.PointerEvent) {
    const start = pointer.current
    pointer.current = null
    const c = controller.current
    if (!c || !start || Math.hypot(event.clientX - start[0], event.clientY - start[1]) > 5) return
    if (c.nivaPlacing) return void c.placeNiva(event)
    if (c.walkMode === 'placing') return void c.placeWalker(event)
    setPlantInfo(c.plantAt(event))
  }

  const loadingLabel = loading === 'failed' ? t('relief.page.loading.failed')
    : loading === 'webgl' ? t('relief.page.loading.webgl')
      : loading ? t(`relief.page.loading.${loading}`) : null
  const placing = walk === 'placing' || niva.mode === 'placing'
  const nightTime = formatClock(nightClock(night))

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-[#dfe9ee]">
      <Head title={props.title}>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <div
        ref={container}
        className={clsx('absolute inset-0', placing && 'cursor-crosshair', walking && 'cursor-grab active:cursor-grabbing')}
        onPointerDown={(event) => { pointer.current = [event.clientX, event.clientY] }}
        onPointerUp={onPointerUp}
      />

      {loadingLabel && (
        <div className="pointer-events-none absolute inset-x-0 top-1/2 z-10 flex -translate-y-1/2 justify-center px-6">
          <p className={clsx(
            'flex items-center gap-2 rounded-full bg-white/85 px-4 py-2 text-sm shadow-sm backdrop-blur',
            loading === 'failed' || loading === 'webgl' ? 'text-clay-700' : 'text-loam-700',
          )}>
            {loading !== 'failed' && loading !== 'webgl' && <Loader2 className="h-4 w-4 animate-spin" />}
            {loadingLabel}
          </p>
        </div>
      )}

      <header className="absolute left-3 top-3 z-20 flex max-w-[calc(100%-6.5rem)] items-center gap-2 rounded-full bg-white/90 py-1 pl-1 pr-4 shadow-md backdrop-blur">
        <Link
          href={props.path}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-loam-600 hover:bg-loam-100 hover:text-prune-700"
          aria-label={t('public_maps.relief.back')}
          title={t('public_maps.relief.back')}
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="min-w-0">
          <h1 className="truncate font-serif text-base leading-tight text-loam-900">{props.title}</h1>
          <p className="truncate text-sm leading-tight text-loam-500">{t('public_maps.relief.subtitle')}</p>
        </div>
      </header>

      {ready && (
        <Compass
          heading={() => controller.current?.heading() ?? null}
          onFaceNorth={() => controller.current?.faceNorth()}
          className="absolute right-3 top-3 z-10 h-16 w-16 rounded-full focus-visible:outline-2 focus-visible:outline-prune-600 sm:h-20 sm:w-20"
        />
      )}

      {/* The four simulations, and under them the one that is open. */}
      <aside className="absolute inset-x-2 bottom-2 z-20 mx-auto max-w-xl rounded-2xl bg-white/95 p-2 shadow-lg ring-1 ring-loam-200 backdrop-blur pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        {mode && ready && (
          <div className="mb-2 space-y-2 px-2 pt-1">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm text-loam-700">{t(`public_maps.relief.${mode}.intro`)}</p>
              <button type="button" onClick={() => choose(mode)} className="rounded-full p-1 text-loam-400 hover:bg-loam-100" aria-label={t('common.close')}>
                <X className="h-4 w-4" />
              </button>
            </div>

            {mode === 'rain' && (
              <>
                <ChoiceGroup
                  label={t('relief.page.rain.intensity')}
                  value={intensity}
                  onChange={chooseIntensity}
                  choices={INTENSITIES.map(({ value, key }) => ({ value, label: `${t(`relief.page.rain.intensities.${key}`)} · ${value} mm/h` }))}
                />
                <div className="flex gap-2">
                  <Button className="flex-1" onClick={toggleRain}>
                    {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                    {playing ? t('relief.page.rain.pause') : stats && stats.time > 0 ? t('relief.page.rain.resume') : t('public_maps.relief.rain.play')}
                  </Button>
                  <Button variant="secondary" onClick={resetRain} aria-label={t('relief.page.rain.reset')} title={t('relief.page.rain.reset')}>
                    <RotateCcw className="h-4 w-4" />
                  </Button>
                </div>
                {stats && stats.time > 0 && (
                  <p className="text-sm text-loam-600" aria-live="polite">
                    {t('public_maps.relief.rain.status', {
                      time: formatDuration(stats.time),
                      kept: formatVolume(stats.kept),
                      outflow: formatVolume(stats.outflow),
                      deepest: formatDepth(stats.deepest),
                    })}
                    {stats.comparison && stats.comparison.held > 0 && (
                      <> {t('public_maps.relief.rain.held', { held: formatVolume(stats.comparison.held) })}</>
                    )}
                  </p>
                )}
              </>
            )}

            {mode === 'night' && (
              <>
                <Slider
                  id="public-relief-night"
                  label={t('relief.page.night.hour')}
                  display={nightTime}
                  min={0}
                  max={NIGHT_STEPS}
                  step={1}
                  value={Math.round(night * NIGHT_STEPS)}
                  onChange={(step) => { setNightRunning(false); updateNight(step / NIGHT_STEPS) }}
                />
                <Button variant="secondary" className="w-full" onClick={toggleNight}>
                  {nightRunning ? <Pause className="h-4 w-4" /> : <MoonStar className="h-4 w-4" />}
                  {nightRunning ? t('relief.page.night.stop') : t('relief.page.night.play')}
                </Button>
                <p className="text-sm text-loam-600" aria-live="polite">
                  {coldPeak > 0.05
                    ? t('relief.page.night.status', { time: nightTime, depth: formatNumber(coldPeak, 1) })
                    : t('relief.page.night.status_none', { time: nightTime })}
                </p>
              </>
            )}

            {mode === 'shade' && (
              <>
                <ChoiceGroup
                  label={t('relief.page.sun.date')}
                  value={sunDate}
                  onChange={chooseDate}
                  choices={SHADE_DATES.map((date) => ({ value: date, label: t(`relief.page.sun.date_titles.${date}`) }))}
                />
                <Slider
                  id="public-relief-hour"
                  label={t('relief.page.sun.hour')}
                  display={formatClock(minutes)}
                  min={sunWindow.min}
                  max={sunWindow.max}
                  step={10}
                  value={minutes}
                  onChange={chooseMinutes}
                />
                <Button variant="secondary" className="w-full" onClick={toggleDay}>
                  {dayRunning ? <Pause className="h-4 w-4" /> : <SunMedium className="h-4 w-4" />}
                  {dayRunning ? t('relief.page.sun.stop_day') : t('relief.page.sun.play_day')}
                </Button>
                {sunInfo.mode === 'instant' && (
                  <p className="text-sm text-loam-600" aria-live="polite">
                    {sunInfo.set
                      ? t('relief.page.sun.status_set')
                      : t('public_maps.relief.shade.status', { shaded: formatNumber(sunInfo.shadedShare * 100) })}
                    {plantCount > 0 && <> {t('public_maps.relief.shade.plants')}</>}
                  </p>
                )}
              </>
            )}

            {mode === 'tour' && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <Button variant={walk !== 'off' ? 'primary' : 'secondary'} onClick={walk !== 'off' ? () => controller.current?.stopWalk() : startWalk}>
                    <Footprints className="h-4 w-4" />
                    {walk !== 'off' ? t('public_maps.relief.tour.stop') : t('public_maps.relief.tour.walk')}
                  </Button>
                  <Button variant={niva.mode !== 'off' ? 'primary' : 'secondary'} onClick={niva.mode !== 'off' ? () => controller.current?.parkNiva() : startDrive}>
                    <Car className="h-4 w-4" />
                    {niva.mode !== 'off' ? t('public_maps.relief.tour.park') : t('public_maps.relief.tour.drive')}
                  </Button>
                </div>
                <p className="text-sm text-loam-500">
                  {placing
                    ? t(touch ? 'public_maps.relief.tour.placing_touch' : 'public_maps.relief.tour.placing')
                    : walking
                      ? t(touch ? 'relief.page.walk.keys_touch' : 'relief.page.walk.keys')
                      : driving
                        ? (touch ? t('public_maps.relief.tour.drive_touch') : t('public_maps.relief.tour.drive_keys'))
                        : t('public_maps.relief.tour.hint')}
                </p>
              </>
            )}
          </div>
        )}

        <nav className="grid grid-cols-4 gap-1" aria-label={t('public_maps.relief.modes_label')}>
          {MODES.map(({ key, Icon }) => (
            <button
              key={key}
              type="button"
              disabled={!ready}
              aria-pressed={mode === key}
              onClick={() => choose(key)}
              className={clsx(
                'flex flex-col items-center gap-0.5 rounded-xl px-1 py-2 text-sm transition disabled:opacity-50',
                mode === key ? 'bg-prune-700 text-white' : 'text-loam-700 hover:bg-loam-100',
              )}
            >
              <Icon className="h-5 w-5" aria-hidden="true" />
              {t(`public_maps.relief.modes.${key}`)}
              {key === 'rain' && playing && mode !== 'rain' && <span className="sr-only">{t('relief.page.rain.pause')}</span>}
            </button>
          ))}
        </nav>
      </aside>

      {ready && plantCount > 0 && !driving && (
        <GrowthBar
          year={growth.target}
          shown={growth.shown}
          playing={growth.playing}
          today={plantToday}
          origin={growingPlants.origin}
          onYear={growth.set}
          onToggle={growth.toggle}
          className="absolute left-3 right-[5.25rem] top-16 sm:left-auto sm:right-28 sm:top-3 sm:w-[28rem]"
        />
      )}
      {plantInfo && <PlantCard info={plantInfo} onClose={() => setPlantInfo(null)} />}
      {driving && <NivaDashboard info={niva} />}
      {driving && touch && <NivaPad raised onKey={(key, down) => controller.current?.setNivaKey(key, down)} />}
      {walking && touch && <WalkPad raised onKey={(key, down) => controller.current?.setWalkKey(key, down)} />}

      {(terrain.attribution || attribution) && (
        <p className="pointer-events-none absolute bottom-0 right-1 z-10 hidden rounded bg-white/70 px-1.5 py-0.5 text-sm text-loam-600 sm:block">
          {[terrain.attribution, attribution].filter(Boolean).join(' · ')}
        </p>
      )}
    </div>
  )
}
