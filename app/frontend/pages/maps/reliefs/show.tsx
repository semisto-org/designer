import { Head, Link, router } from '@inertiajs/react'
import clsx from 'clsx'
import {
  ArrowLeft, CloudRain, Crosshair, Download, Eye, Loader2, Menu, Pause, Play, RotateCcw, Sun, SunMedium, X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { HelpButton } from '@/components/help/HelpButton'
import { Button } from '@/components/ui/Button'
import { Flash } from '@/components/ui/Flash'
import { api } from '@/lib/api'
import { t } from '@/lib/i18n'
import { LAYER_COLORS } from '@/map/layers/features'
import { CANOPY_MAX, CANOPY_RAMP, FROST_RAMP, HYPSOMETRY, SUN_RAMP, WETNESS_RAMP } from '@/relief/colors'
import {
  ReliefController, type BaseLayer, type DesignSummary, type LoadingStep, type NivaInfo, type NivaKey, type ProbeInfo,
  type RainSettings, type RainStats, type SunDate, type SunInfo, type SunMode,
} from '@/relief/controller'
import { NivaDashboard, NivaPad, NivaSection, type NivaSettings } from '@/relief/NivaControls'
import {
  formatClock, formatDepth, formatDuration, formatHours, formatMinutes, formatNumber, formatSurface, formatVolume,
} from '@/relief/format'
import type { OverlayFeature, OverlayOptions } from '@/relief/overlay'
import { ChoiceGroup, GradientLegend, SectionTitle, Slider, Toggle } from '@/relief/ui'
import type { MapData, MapFeature } from '@/types'
import type { LandcoverClassData, ReliefOverview, SoilModel, TerrainGridData } from '@/types/relief'

type Props = {
  map: MapData
  terrain: TerrainGridData | null
  overview: ReliefOverview
  features: MapFeature[]
  timezone: string
  location: [number, number] | null
  landcoverClasses: Record<string, LandcoverClassData>
  soilModel: SoilModel
  canEdit: boolean
}

/** The map's terrain in 3D: relief, rain and runoff, sun and shade. */
export default function ReliefShow(props: Props) {
  return (
    <>
      <Head title={`${t('relief.page.title')} · ${props.map.name}`} />
      <Flash />
      {props.terrain ? <ReliefViewer {...props} terrain={props.terrain} /> : <ReliefEmpty {...props} />}
    </>
  )
}

// ---- Before the terrain is there ---------------------------------------------

function ReliefEmpty({ map, overview, canEdit }: Props) {
  const terrain = overview.terrain
  const running = terrain?.status === 'pending' || terrain?.status === 'running'
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // While the import runs, check every few seconds.
  useEffect(() => {
    if (!running) return
    const timer = setInterval(() => router.reload({ only: ['terrain', 'overview'] }), 4000)
    return () => clearInterval(timer)
  }, [running])

  async function startImport() {
    setBusy(true)
    setError(null)
    try {
      await api(`/maps/${map.id}/terrain`, { method: 'POST' })
      router.reload({ only: ['terrain', 'overview'] })
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  let message: ReactNode
  let action: ReactNode = null
  if (!overview.available) {
    message = t('relief.page.empty.unavailable', { region: map.region.name })
  } else if (!overview.hasBoundary) {
    message = t('relief.page.empty.no_boundary')
  } else if (running) {
    message = (
      <>
        <span className="flex items-center justify-center gap-2 font-medium text-loam-800">
          <Loader2 className="h-4 w-4 animate-spin" />
          {terrain?.status === 'pending' ? t('relief.page.empty.pending') : t('relief.page.empty.running', { progress: terrain?.progress ?? 0 })}
        </span>
        <span className="mt-1 block">{t('relief.page.empty.running_hint')}</span>
      </>
    )
  } else {
    const failed = terrain?.status === 'failed'
    message = (
      <>
        {failed && <span className="block font-medium text-clay-700">{t('relief.page.empty.failed')} {terrain?.error}</span>}
        <span className="block">{t('relief.page.empty.not_imported', { provider: overview.providerLabel ?? '' })}</span>
        {!canEdit && <span className="mt-1 block">{t('relief.page.empty.viewer')}</span>}
      </>
    )
    if (canEdit && !('error' in (overview.grid ?? {}))) {
      action = (
        <Button onClick={startImport} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          {failed ? t('relief.panel_ui.retry') : t('relief.panel_ui.import')}
        </Button>
      )
    } else if (overview.grid && 'error' in overview.grid) {
      message = <span className="block">{overview.grid.error}</span>
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-loam-100 px-4 py-10">
      <div className="w-full max-w-lg rounded-2xl border border-dashed border-loam-300 bg-white/80 p-8 text-center shadow-sm">
        <h1 className="text-xl text-loam-900">{t('relief.page.empty.title')}</h1>
        <p className="mt-1 text-sm text-loam-500">{map.name}</p>
        <div className="mt-4 text-sm text-loam-600">{message}</div>
        {error && <p className="mt-3 text-sm text-clay-700">{error}</p>}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          {action}
          <Link href={`/maps/${map.id}`} className="text-sm font-medium text-prune-700 hover:underline">
            {t('relief.page.back')}
          </Link>
        </div>
      </div>
    </div>
  )
}

// ---- The 3D viewer -------------------------------------------------------------

type Tab = 'view' | 'rain' | 'sun'

type ViewState = {
  base: BaseLayer
  exaggeration: number
  contour: number
  axes: boolean
  hollows: boolean
  features: boolean
  particles: boolean
  surfaceOn: boolean
}

const INTENSITIES = [
  { value: 10, key: 'light' }, { value: 30, key: 'heavy' }, { value: 60, key: 'storm' },
] as const
const DURATIONS = [15, 30, 60, 120]
const SPEEDS = [{ value: 1, key: 'slow' }, { value: 4, key: 'normal' }, { value: 16, key: 'fast' }] as const
const CONTOURS = [0, 1, 2.5, 5]

function isCompact() {
  return typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches
}

function ReliefViewer({ map, terrain, features, timezone, location, landcoverClasses, soilModel }: Props & { terrain: TerrainGridData }) {
  const container = useRef<HTMLDivElement>(null)
  const controller = useRef<ReliefController | null>(null)
  const [loading, setLoading] = useState<LoadingStep | 'failed' | 'webgl'>('download')
  const [ready, setReady] = useState(false)
  const [panelOpen, setPanelOpen] = useState(() => !isCompact())
  const [tab, setTab] = useState<Tab>('view')
  const [view, setView] = useState<ViewState | null>(null)
  const [rain, setRainState] = useState<RainSettings>({ intensity: 30, duration: 60, soilState: 'normal', speed: 4, dig: true })
  const [playing, setPlaying] = useState(false)
  const [stats, setStats] = useState<RainStats | null>(null)
  const [designs, setDesigns] = useState<DesignSummary[]>([])
  const [designCount, setDesignCount] = useState(0)
  const [sun, setSunState] = useState<{ mode: SunMode; date: SunDate; minutes: number }>({ mode: 'off', date: 'summer', minutes: 14 * 60 })
  const [sunInfo, setSunInfo] = useState<SunInfo>({ mode: 'off' })
  const [dayRunning, setDayRunning] = useState(false)
  const [probe, setProbe] = useState<ProbeInfo | null>(null)
  const [zRange, setZRange] = useState<[number, number]>([terrain.zMin, terrain.zMax])
  const [niva, setNiva] = useState<NivaInfo>({ mode: 'off' })
  const [nivaSettings, setNivaSettings] = useState<NivaSettings>({ lights: { low: false, bar: false }, night: false, camera: 'chase' })
  const pointer = useRef<[number, number] | null>(null)
  const touch = useMemo(() => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches, [])

  useEffect(() => {
    if (!container.current) return
    const instance = new ReliefController({
      container: container.current,
      terrain,
      features: features as unknown as OverlayFeature[],
      boundary: map.boundary,
      landcoverClasses,
      soil: soilModel,
      location,
      timezone,
      layerColors: LAYER_COLORS,
      compact: isCompact(),
      onLoading: (step) => setLoading(step),
      onStats: setStats,
      onSun: setSunInfo,
      onDesigns: setDesigns,
      onNiva: (info) => {
        setNiva(info)
        // The headlights switch on by themselves at night.
        setNivaSettings((current) => ({ ...current, lights: { ...instance.nivaLights } }))
      },
    })
    controller.current = instance
    instance.load().then(() => {
      if (instance.disposed) return
      setView({ ...instance.view })
      setZRange(instance.zRange)
      setDesignCount(instance.designs.length)
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

  const updateView = useCallback((patch: Partial<ViewState>) => {
    setView((current) => (current ? { ...current, ...patch } : current))
    const c = controller.current
    if (!c) return
    if (patch.base) void c.setBase(patch.base)
    if (patch.exaggeration !== undefined) c.setExaggeration(patch.exaggeration)
    if (patch.contour !== undefined) c.setContour(patch.contour)
    const overlay: Partial<OverlayOptions> = {}
    if (patch.axes !== undefined) overlay.axes = patch.axes
    if (patch.hollows !== undefined) overlay.hollows = patch.hollows
    if (patch.features !== undefined) overlay.features = patch.features
    if (Object.keys(overlay).length) c.setOverlay(overlay)
    if (patch.particles !== undefined) c.setParticles(patch.particles)
    if (patch.surfaceOn !== undefined) c.setSurface(patch.surfaceOn)
  }, [])

  const updateRain = useCallback((patch: Partial<RainSettings>) => {
    setRainState((current) => ({ ...current, ...patch }))
    const c = controller.current
    if (!c) return
    if (patch.dig !== undefined) {
      setPlaying(false)
      void c.setDig(patch.dig).then(() => setStats(c.stats()))
      return
    }
    c.setRain(patch)
  }, [])

  function togglePlay() {
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

  // ---- Sun: the hour slider coalesces to the latest value.
  const sunQueue = useRef<{ busy: boolean; pending: number | null }>({ busy: false, pending: null })
  const applyMinutes = useCallback(async (minutes: number) => {
    const queue = sunQueue.current
    queue.pending = minutes
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
    () => (ready && controller.current ? controller.current.sunWindow(sun.date) : { min: 300, max: 1320 }),
    [ready, sun.date],
  )

  function updateSun(patch: Partial<{ mode: SunMode; date: SunDate; minutes: number }>) {
    const next = { ...sun, ...patch }
    if (patch.date && controller.current) {
      const window = controller.current.sunWindow(patch.date)
      next.minutes = Math.min(window.max, Math.max(window.min, next.minutes))
    }
    if (patch.mode && patch.mode !== 'instant') setDayRunning(false)
    setSunState(next)
    if (patch.minutes !== undefined && !patch.mode && !patch.date) void applyMinutes(next.minutes)
    else void controller.current?.setSun(next)
  }

  // "Let the day go by": the hour advances by 10 min steps.
  useEffect(() => {
    if (!dayRunning) return
    const timer = setInterval(() => {
      setSunState((current) => {
        const minutes = current.minutes + 10
        if (minutes > sunWindow.max) {
          setDayRunning(false)
          return current
        }
        void applyMinutes(minutes)
        return { ...current, minutes }
      })
    }, 140)
    return () => clearInterval(timer)
  }, [dayRunning, sunWindow.max, applyMinutes])

  function toggleDay() {
    if (dayRunning) return setDayRunning(false)
    if (sun.minutes >= sunWindow.max - 10) updateSun({ minutes: sunWindow.min })
    setDayRunning(true)
  }

  // ---- The Niva: arrows (or W A S D) drive, space brakes; H headlights,
  // L light bar, N night, C camera, Escape cancels placing.
  const nivaActive = niva.mode !== 'off'
  useEffect(() => {
    if (!nivaActive) return
    const keys: Record<string, NivaKey> = {
      ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
      ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', Space: 'brake',
    }
    const onKey = (event: KeyboardEvent) => {
      const c = controller.current
      if (!c) return
      if ((event.target as HTMLElement | null)?.closest?.('input, textarea, select, [contenteditable]')) return
      const down = event.type === 'keydown'
      if (down && event.code === 'Escape' && c.nivaPlacing) return c.cancelPlacing()
      if (!c.niva) return
      const key = keys[event.code]
      if (key) {
        event.preventDefault()
        c.setNivaKey(key, down)
        return
      }
      if (!down || event.repeat || event.metaKey || event.ctrlKey || event.altKey) return
      if (event.code === 'KeyH') updateNiva({ lights: { ...c.nivaLights, low: !c.nivaLights.low } })
      else if (event.code === 'KeyL') updateNiva({ lights: { ...c.nivaLights, bar: !c.nivaLights.bar } })
      else if (event.code === 'KeyN') updateNiva({ night: !c.scene?.night })
      else if (event.code === 'KeyC') updateNiva({ camera: c.scene?.cameraMode === 'chase' ? 'orbit' : 'chase' })
    }
    // A window losing focus must not leave the throttle pressed.
    const onBlur = () => controller.current?.resetNivaInput()
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKey)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onKey)
      window.removeEventListener('blur', onBlur)
    }
    // updateNiva only reads the controller and the setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nivaActive])

  function updateNiva(patch: Partial<NivaSettings>) {
    const c = controller.current
    if (!c) return
    if (patch.night !== undefined) c.setNight(patch.night)
    if (patch.lights) {
      c.setNivaLight('low', patch.lights.low)
      c.setNivaLight('bar', patch.lights.bar)
    }
    if (patch.camera) c.setCameraMode(patch.camera)
    setNivaSettings((current) => ({ ...current, ...patch, lights: { ...c.nivaLights } }))
  }

  // ---- Probe: a click (not a drag) on the terrain; while placing the Niva, sets it down.
  async function onPointerUp(event: React.PointerEvent) {
    const start = pointer.current
    pointer.current = null
    if (!start || Math.hypot(event.clientX - start[0], event.clientY - start[1]) > 5) return
    if (controller.current?.nivaPlacing) {
      controller.current.placeNiva(event)
      setProbe(null)
      return
    }
    const info = await controller.current?.probe(event)
    setProbe(info ?? null)
  }

  const loadingLabel = loading === 'failed' ? t('relief.page.loading.failed')
    : loading === 'webgl' ? t('relief.page.loading.webgl')
      : loading ? t(`relief.page.loading.${loading}`) : null
  const sourcesLabel = Object.values(terrain.sources).join(' · ')

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-[#dfe9ee]">
      <div
        ref={container}
        className={clsx('absolute inset-0', niva.mode === 'placing' && 'cursor-crosshair')}
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

      {/* Settings: a floating card on desktop, a bottom sheet on phones. */}
      <aside
        className={clsx(
          'absolute z-20 flex flex-col border-loam-200 bg-white/95 shadow-lg backdrop-blur',
          'inset-x-0 bottom-0 max-h-[60dvh] rounded-t-2xl border-t pb-[env(safe-area-inset-bottom)]',
          'sm:inset-x-auto sm:bottom-auto sm:left-3 sm:top-3 sm:max-h-[calc(100%-1.5rem)] sm:w-80 sm:rounded-xl sm:border sm:pb-0',
        )}
      >
        <header className="flex items-center gap-2 px-3 py-2.5">
          <Link
            href={`/maps/${map.id}`}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-loam-500 hover:bg-loam-100 hover:text-prune-700"
            aria-label={t('relief.page.back')}
            title={t('relief.page.back')}
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-sans text-sm font-semibold text-loam-900">{t('relief.page.title')}</h1>
            <p className="truncate text-xs text-loam-500">{map.name}</p>
          </div>
          <HelpButton iconOnly slug="lire-le-relief-et-l-eau" className="px-2" />
          <button
            type="button"
            onClick={() => setPanelOpen((open) => !open)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-loam-500 hover:bg-loam-100"
            aria-expanded={panelOpen}
            aria-label={panelOpen ? t('relief.page.collapse') : t('relief.page.expand')}
          >
            {panelOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </header>

        {panelOpen && (
          <>
            <nav className="flex gap-1 border-t border-loam-100 px-3 pt-2" role="tablist">
              {([['view', Eye], ['rain', CloudRain], ['sun', SunMedium]] as const).map(([key, Icon]) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={tab === key}
                  onClick={() => setTab(key)}
                  className={clsx(
                    'flex flex-1 items-center justify-center gap-1.5 rounded-t-lg border-b-2 px-2 py-1.5 text-sm',
                    tab === key ? 'border-prune-600 font-semibold text-prune-700' : 'border-transparent text-loam-500 hover:text-loam-800',
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {t(`relief.page.tabs.${key}`)}
                  {key === 'rain' && playing && <span className="h-1.5 w-1.5 rounded-full bg-sky-500" />}
                </button>
              ))}
            </nav>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto border-t border-loam-100 px-3 pb-3 pt-3">
              {!ready || !view ? (
                <p className="text-xs text-loam-400">{loadingLabel}</p>
              ) : tab === 'view' ? (
                <ViewTab
                  view={view}
                  update={updateView}
                  terrain={terrain}
                  zRange={zRange}
                  landcoverClasses={landcoverClasses}
                  onReset={() => controller.current?.resetView()}
                  onTop={() => controller.current?.topView()}
                  niva={(
                    <NivaSection
                      info={niva}
                      settings={nivaSettings}
                      onToggle={() => controller.current?.toggleNiva()}
                      onMove={() => controller.current?.moveNiva()}
                      onLight={(which, on) => updateNiva({ lights: { ...nivaSettings.lights, [which]: on } })}
                      onNight={(night) => updateNiva({ night })}
                      onCamera={(camera) => updateNiva({ camera })}
                    />
                  )}
                />
              ) : tab === 'rain' ? (
                <RainTab
                  rain={rain}
                  update={updateRain}
                  playing={playing}
                  stats={stats}
                  designs={designs}
                  designCount={designCount}
                  soilModel={soilModel}
                  landcover={terrain.landcover}
                  simCell={controller.current ? controller.current.cell * controller.current.simFactor : terrain.cellSizeM}
                  onPlay={togglePlay}
                  onReset={resetRain}
                />
              ) : (
                <SunTab
                  sun={sun}
                  info={sunInfo}
                  window={sunWindow}
                  update={updateSun}
                  dayRunning={dayRunning}
                  onToggleDay={toggleDay}
                  surface={!!terrain.surface}
                  marginM={terrain.marginM}
                  timezone={timezone}
                />
              )}
              <footer className="border-t border-loam-100 pt-3 text-[0.7rem] leading-snug text-loam-400">
                {sourcesLabel && <p>{t('relief.page.sources', { sources: sourcesLabel })}</p>}
                <p>{t('relief.page.grid', { cell: formatNumber(terrain.cellSizeM, terrain.cellSizeM % 1 ? 1 : 0), margin: Math.round(terrain.marginM) })}</p>
                {terrain.fetchedAt && (
                  <p>{t('relief.page.fetched', { date: new Date(terrain.fetchedAt).toLocaleDateString('fr-BE', { day: 'numeric', month: 'long', year: 'numeric' }) })}</p>
                )}
              </footer>
            </div>
          </>
        )}
      </aside>

      {probe && (
        <ProbeCard
          probe={probe}
          sunTime={sun.mode === 'instant' ? formatClock(sun.minutes) : null}
          onClose={() => setProbe(null)}
        />
      )}

      {terrain.attribution && (
        <p className="pointer-events-none absolute right-2 top-2 z-10 rounded bg-white/70 px-1.5 py-0.5 text-[0.65rem] text-loam-600 sm:top-auto sm:bottom-1">
          {terrain.attribution}
        </p>
      )}
      {niva.mode === 'driving' && <NivaDashboard info={niva} />}
      {niva.mode === 'driving' && touch && (
        <NivaPad raised={panelOpen} onKey={(key, down) => controller.current?.setNivaKey(key, down)} />
      )}
      {niva.mode === 'placing' && (
        <p className="pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-full bg-prune-600 px-3 py-1 text-xs font-medium text-white shadow sm:top-auto sm:bottom-3">
          {t('relief.page.niva.placing')}
        </p>
      )}
      {ready && !probe && !nivaActive && (
        <p className="pointer-events-none absolute bottom-3 left-1/2 z-10 hidden -translate-x-1/2 rounded-full bg-white/80 px-3 py-1 text-[0.7rem] text-loam-500 md:block">
          {touch ? t('relief.page.hint_touch') : t('relief.page.hint')}
        </p>
      )}
    </div>
  )
}

// ---- View tab -------------------------------------------------------------------

function ViewTab({ view, update, terrain, zRange, landcoverClasses, onReset, onTop, niva }: {
  view: ViewState
  update: (patch: Partial<ViewState>) => void
  terrain: TerrainGridData
  zRange: [number, number]
  landcoverClasses: Record<string, LandcoverClassData>
  onReset: () => void
  onTop: () => void
  niva: ReactNode
}) {
  const bases: BaseLayer[] = [
    ...(terrain.files.texture ? ['ortho' as const] : []),
    'altitude',
    ...(terrain.surface ? ['canopy' as const] : []),
    'aspect', 'wetness', 'frost',
    ...(terrain.landcover ? ['landcover' as const] : []),
    'blocks',
  ]
  return (
    <>
      <div>
        <SectionTitle>{t('relief.page.view.base')}</SectionTitle>
        <ChoiceGroup
          value={view.base}
          columns={bases.length > 4 ? 3 : bases.length}
          onChange={(base) => update({ base })}
          choices={bases.map((base) => ({ value: base, label: t(`relief.page.view.bases.${base}`), title: t(`relief.page.view.base_titles.${base}`) }))}
        />
        <BaseLegend base={view.base} zRange={zRange} landcoverClasses={landcoverClasses} />
      </div>

      <Slider
        id="relief-exaggeration"
        label={t('relief.page.view.exaggeration')}
        display={`×${formatNumber(view.exaggeration, view.exaggeration % 1 ? 1 : 0)}`}
        min={1}
        max={5}
        step={0.5}
        value={view.exaggeration}
        onChange={(exaggeration) => update({ exaggeration })}
      />

      <div>
        <SectionTitle>{t('relief.page.view.contours')}</SectionTitle>
        <ChoiceGroup
          value={view.contour}
          onChange={(contour) => update({ contour })}
          choices={CONTOURS.map((value) => ({
            value, label: value ? `${formatNumber(value, value % 1 ? 1 : 0)} m` : t('relief.page.view.contour_none'),
          }))}
        />
        <p className="mt-1 text-xs text-loam-400">{t('relief.page.view.contours_hint')}</p>
      </div>

      <div className="space-y-2">
        <Toggle checked={view.axes} onChange={(axes) => update({ axes })} label={t('relief.page.view.axes')} hint={t('relief.page.view.axes_hint')} />
        <Toggle checked={view.hollows} onChange={(hollows) => update({ hollows })} label={t('relief.page.view.hollows')} hint={t('relief.page.view.hollows_hint')} />
        <Toggle checked={view.features} onChange={(on) => update({ features: on })} label={t('relief.page.view.features')} hint={t('relief.page.view.features_hint')} />
        <Toggle checked={view.particles} onChange={(particles) => update({ particles })} label={t('relief.page.view.particles')} hint={t('relief.page.view.particles_hint')} />
        {terrain.surface && (
          <Toggle checked={view.surfaceOn} onChange={(surfaceOn) => update({ surfaceOn })} label={t('relief.page.view.surface')} hint={t('relief.page.view.surface_hint')} />
        )}
      </div>

      <div className="flex gap-2">
        <Button variant="secondary" size="sm" className="flex-1 whitespace-nowrap text-xs" onClick={onReset}>
          <RotateCcw className="h-3.5 w-3.5" />
          {t('relief.page.view.reset')}
        </Button>
        <Button variant="secondary" size="sm" className="flex-1 whitespace-nowrap text-xs" onClick={onTop}>
          <Crosshair className="h-3.5 w-3.5" />
          {t('relief.page.view.top')}
        </Button>
      </div>

      {niva}
    </>
  )
}

function BaseLegend({ base, zRange, landcoverClasses }: {
  base: BaseLayer
  zRange: [number, number]
  landcoverClasses: Record<string, LandcoverClassData>
}) {
  const legend = (key: string) => t(`relief.page.view.legends.${key}`)
  switch (base) {
    case 'altitude':
      return <GradientLegend stops={HYPSOMETRY} left={`${formatNumber(zRange[0])} m`} right={`${formatNumber(zRange[1])} m`}>{legend('altitude')}</GradientLegend>
    case 'canopy':
      return <GradientLegend stops={CANOPY_RAMP} left="0 m" right={`${CANOPY_MAX} m`}>{legend('canopy')}</GradientLegend>
    case 'wetness':
      return <GradientLegend stops={WETNESS_RAMP} left={t('relief.page.wetness.dry')} right={t('relief.page.wetness.wet')}>{legend('wetness')}</GradientLegend>
    case 'frost':
      return <GradientLegend stops={FROST_RAMP} left={t('relief.page.frost.low')} right={t('relief.page.frost.high')}>{legend('frost')}</GradientLegend>
    case 'aspect':
      return <p className="mt-2 text-xs text-loam-500">{legend('aspect')}</p>
    case 'blocks':
      return <p className="mt-2 text-xs text-loam-500">{legend('blocks')}</p>
    case 'landcover':
      return (
        <div className="mt-2">
          <ul className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-xs text-loam-600">
            {Object.entries(landcoverClasses).map(([code, item]) => (
              <li key={code} className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: item.color }} />
                <span className="truncate">{item.label}</span>
              </li>
            ))}
          </ul>
          <p className="mt-1 text-xs text-loam-400">{legend('landcover')}</p>
        </div>
      )
    default:
      return null
  }
}

// ---- Rain tab -------------------------------------------------------------------

function RainTab({ rain, update, playing, stats, designs, designCount, soilModel, landcover, simCell, onPlay, onReset }: {
  rain: RainSettings
  update: (patch: Partial<RainSettings>) => void
  playing: boolean
  stats: RainStats | null
  designs: DesignSummary[]
  designCount: number
  soilModel: SoilModel
  landcover: boolean
  simCell: number
  onPlay: () => void
  onReset: () => void
}) {
  const started = !!stats && stats.time > 0
  const signed = (volume: number) => (Math.abs(volume) < 0.05 ? formatVolume(0) : `${volume < 0 ? '−' : '+'}${formatVolume(Math.abs(volume))}`)
  return (
    <>
      <div>
        <SectionTitle>{t('relief.page.rain.intensity')}</SectionTitle>
        <ChoiceGroup
          value={rain.intensity}
          onChange={(intensity) => update({ intensity })}
          choices={INTENSITIES.map(({ value, key }) => ({ value, label: t(`relief.page.rain.intensities.${key}`), sub: `${value} mm/h` }))}
        />
      </div>
      <div>
        <SectionTitle>{t('relief.page.rain.duration')}</SectionTitle>
        <ChoiceGroup value={rain.duration} onChange={(duration) => update({ duration })} choices={DURATIONS.map((value) => ({ value, label: formatMinutes(value) }))} />
      </div>
      <div>
        <SectionTitle>{t('relief.page.rain.soil_state')}</SectionTitle>
        <ChoiceGroup
          value={rain.soilState}
          onChange={(soilState) => update({ soilState })}
          choices={(['dry', 'normal', 'wet'] as const).map((value) => ({ value, label: t(`relief.page.rain.soil_states.${value}`) }))}
        />
        <p className="mt-1 text-xs text-loam-500">
          {landcover
            ? t('relief.page.rain.soil_landcover')
            : t('relief.page.rain.soil_uniform', {
              rate: formatNumber(soilModel.uniformRate * soilModel.rateFactor, 1),
              storage: formatNumber(soilModel.storage * soilModel.storageFactor),
            })}
        </p>
        <details className="mt-1 text-xs text-loam-500">
          <summary className="cursor-pointer">
            {t('relief.page.rain.soil_model', { soil: t(`relief.soils.${soilModel.soil}`) })}
            <span className="ml-1.5 rounded bg-humus-100 px-1 py-px text-[0.65rem] font-medium uppercase tracking-wide text-humus-700">
              {t('relief.page.rain.indicative')}
            </span>
          </summary>
          <p className="mt-1 font-medium text-loam-600">{t('relief.page.rain.limits_title')}</p>
          <p className="mt-0.5 text-loam-500">{t('relief.page.rain.limits')}</p>
        </details>
      </div>

      <div>
        {designCount > 0 ? (
          <>
            <Toggle checked={rain.dig} onChange={(dig) => update({ dig })} label={t('relief.page.rain.dig')} hint={t('relief.page.rain.dig_hint')} />
            {rain.dig && designs.length > 0 && (
              <ul className="mt-2 space-y-1 text-xs">
                {designs.map((design) => (
                  <li key={String(design.id)} className="rounded-md bg-loam-50 px-2 py-1">
                    <span className="block truncate font-medium text-loam-700">{design.name || t(`relief.page.rain.kinds.${design.kind}`)}</span>
                    <span className="block tabular-nums text-loam-500">
                      {t('relief.page.rain.design_line', { capacity: formatVolume(design.capacity), water: formatVolume(design.water) })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <p className="text-xs text-loam-400">{t('relief.page.rain.no_designs')}</p>
        )}
      </div>

      <div>
        <SectionTitle>{t('relief.page.rain.speed')}</SectionTitle>
        <ChoiceGroup value={rain.speed} onChange={(speed) => update({ speed })} choices={SPEEDS.map(({ value, key }) => ({ value, label: t(`relief.page.rain.speeds.${key}`) }))} />
      </div>

      <div className="flex gap-2">
        <Button className="flex-1" onClick={onPlay}>
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          {playing ? t('relief.page.rain.pause') : started ? t('relief.page.rain.resume') : t('relief.page.rain.play')}
        </Button>
        <Button variant="secondary" onClick={onReset}>{t('relief.page.rain.reset')}</Button>
      </div>

      <div className="rounded-lg bg-loam-50 p-2 text-xs" aria-live="polite">
        <div className="flex items-baseline justify-between">
          <span className="text-loam-500">{t('relief.page.rain.clock')}</span>
          <span className="font-semibold tabular-nums text-loam-800">{formatDuration(stats?.time ?? 0)}</span>
        </div>
        <p className="mt-0.5 text-loam-500">
          {!started
            ? t('relief.page.rain.planned', { intensity: rain.intensity, duration: formatMinutes(rain.duration) })
            : stats.raining ? t('relief.page.rain.raining', { intensity: rain.intensity }) : t('relief.page.rain.stopped')}
        </p>
        {started && (
          <dl className="mt-2 space-y-0.5">
            <StatRow label={t('relief.page.rain.stats.rained')} value={formatVolume(stats.rained)} />
            <StatRow label={t('relief.page.rain.stats.infiltrated')} value={formatVolume(stats.infiltrated)} />
            <StatRow label={t('relief.page.rain.stats.outflow')} value={formatVolume(stats.outflow)} />
            <StatRow label={t('relief.page.rain.stats.stored')} value={formatVolume(stats.stored)} />
            <StatRow label={t('relief.page.rain.stats.deepest')} value={formatDepth(stats.deepest)} />
            {stats.saturated != null && (
              <StatRow label={t('relief.page.rain.stats.saturated')} value={`${formatNumber(stats.saturated * 100)} %`} />
            )}
          </dl>
        )}
        {started && stats.comparison && (
          <div className="mt-2 border-t border-loam-200 pt-2">
            <p className="mb-1 font-semibold text-loam-700">{t('relief.page.rain.comparison.title')}</p>
            <dl className="space-y-0.5">
              <StatRow strong label={t('relief.page.rain.comparison.held')} value={formatVolume(stats.comparison.held)} />
              <StatRow
                strong
                label={t('relief.page.rain.comparison.kept')}
                value={`${signed(stats.comparison.gain)} (${stats.comparison.gainPercent > 0 ? '+' : ''}${stats.comparison.gainPercent} %)`}
              />
              <StatRow strong label={t('relief.page.rain.comparison.soaked')} value={signed(stats.comparison.soakedMore)} />
            </dl>
            <p className="mt-1 text-loam-400">{t('relief.page.rain.comparison.hint')}</p>
          </div>
        )}
        <p className="mt-2 text-loam-400">{t('relief.page.rain.grid', { cell: formatNumber(simCell, simCell % 1 ? 1 : 0) })}</p>
      </div>
    </>
  )
}

function StatRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-loam-500">{label}</dt>
      <dd className={clsx('tabular-nums', strong ? 'font-semibold text-sky-800' : 'text-loam-800')}>{value}</dd>
    </div>
  )
}

// ---- Sun tab --------------------------------------------------------------------

function SunTab({ sun, info, window, update, dayRunning, onToggleDay, surface, marginM, timezone }: {
  sun: { mode: SunMode; date: SunDate; minutes: number }
  info: SunInfo
  window: { min: number; max: number }
  update: (patch: Partial<{ mode: SunMode; date: SunDate; minutes: number }>) => void
  dayRunning: boolean
  onToggleDay: () => void
  surface: boolean
  marginM: number
  timezone: string
}) {
  const localZone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, [])
  return (
    <>
      <div>
        <SectionTitle>{t('relief.page.sun.mode')}</SectionTitle>
        <ChoiceGroup
          value={sun.mode}
          onChange={(mode) => update({ mode })}
          choices={(['off', 'instant', 'day'] as const).map((value) => ({ value, label: t(`relief.page.sun.modes.${value}`) }))}
        />
      </div>
      <div>
        <SectionTitle>{t('relief.page.sun.date')}</SectionTitle>
        <ChoiceGroup
          value={sun.date}
          onChange={(date) => update({ date })}
          choices={(['winter', 'equinox', 'summer', 'today'] as const).map((value) => ({
            value, label: t(`relief.page.sun.dates.${value}`), title: t(`relief.page.sun.date_titles.${value}`),
          }))}
        />
      </div>
      {sun.mode === 'instant' && (
        <>
          <Slider
            id="relief-sun-hour"
            label={t('relief.page.sun.hour')}
            display={formatClock(sun.minutes)}
            min={window.min}
            max={window.max}
            step={5}
            value={sun.minutes}
            onChange={(minutes) => update({ minutes })}
          />
          <Button variant="secondary" size="sm" className="w-full" onClick={onToggleDay}>
            {dayRunning ? <Pause className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5" />}
            {dayRunning ? t('relief.page.sun.stop_day') : t('relief.page.sun.play_day')}
          </Button>
          {localZone !== timezone && <p className="text-xs text-loam-400">{t('relief.page.sun.timezone', { zone: timezone })}</p>}
        </>
      )}
      <SunStatus info={info} marginM={marginM} />
      {sun.mode !== 'off' && !surface && <p className="text-xs text-humus-700">{t('relief.page.sun.no_surface')}</p>}
    </>
  )
}

function SunStatus({ info, marginM }: { info: SunInfo; marginM: number }) {
  if (info.mode === 'instant') {
    return (
      <p className="text-xs text-loam-600" aria-live="polite">
        {info.set
          ? t('relief.page.sun.status_set')
          : t('relief.page.sun.status_instant', {
            altitude: formatNumber(info.altitude),
            direction: t(`relief.page.compass.at.${info.azimuth}`),
            shaded: formatNumber(info.shadedShare * 100),
          })}
      </p>
    )
  }
  if (info.mode === 'day') {
    if (info.computing != null || info.daylight == null) {
      return (
        <p className="flex items-center gap-1.5 text-xs text-loam-600" aria-live="polite">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {t('relief.page.sun.computing', { progress: Math.round((info.computing ?? 0) * 100) })}
        </p>
      )
    }
    return (
      <GradientLegend stops={SUN_RAMP} left={t('relief.page.sun.legend_min')} right={t('relief.page.sun.daylight', { hours: formatHours(info.daylight) })}>
        {t('relief.page.sun.legend_hint', { margin: Math.round(marginM) })}
      </GradientLegend>
    )
  }
  return null
}

// ---- Probe ----------------------------------------------------------------------

function ProbeCard({ probe, sunTime, onClose }: { probe: ProbeInfo; sunTime: string | null; onClose: () => void }) {
  const facing = probe.slopePct < 2
    ? t('relief.page.probe.flat')
    : t('relief.page.probe.slope', { value: formatNumber(probe.slopePct), direction: t(`relief.page.compass.towards.${probe.aspect}`) })
  const lines: ReactNode[] = [
    <p key="station">
      {t('relief.page.probe.station', {
        facing, wetness: t(`relief.page.wetness.${probe.wetness}`), frost: t(`relief.page.frost.${probe.frost}`),
      })}{' '}
      <span className="text-loam-400">{t('relief.page.probe.indices')}</span>
    </p>,
  ]
  if (probe.landcover) {
    lines.push(<p key="landcover">{t('relief.page.probe.landcover', {
      label: probe.landcover.label, rate: formatNumber(probe.landcover.rate), storage: formatNumber(probe.landcover.storage),
    })}</p>)
  }
  if (probe.above != null && probe.above > 0.5) {
    lines.push(<p key="above">{t('relief.page.probe.above', { value: formatNumber(probe.above, 1) })}</p>)
  }
  if (probe.sun && 'hours' in probe.sun) {
    lines.push(<p key="sun">{t('relief.page.probe.sun_hours', { hours: formatHours(probe.sun.hours), daylight: formatHours(probe.sun.daylight) })}</p>)
  } else if (probe.sun && sunTime) {
    lines.push(<p key="sun">{t(probe.sun.inSun ? 'relief.page.probe.in_sun' : 'relief.page.probe.in_shade', { time: sunTime })}</p>)
  }
  lines.push(<p key="drained">{t('relief.page.probe.drained', { area: formatSurface(probe.drained) })}</p>)
  if (probe.hollow > 0.05) lines.push(<p key="hollow">{t('relief.page.probe.hollow', { depth: formatDepth(probe.hollow) })}</p>)
  if (probe.water) {
    lines.push(<p key="water">{probe.water.speed > 0.01
      ? t('relief.page.probe.water_speed', { depth: formatDepth(probe.water.depth), speed: formatNumber(probe.water.speed, 2) })
      : t('relief.page.probe.water', { depth: formatDepth(probe.water.depth) })}</p>)
  }
  return (
    <div
      className={clsx(
        'absolute z-30 space-y-0.5 rounded-xl border border-loam-200 bg-white/95 p-3 pr-8 text-xs text-loam-600 shadow-lg backdrop-blur',
        'inset-x-3 top-3 sm:inset-x-auto sm:bottom-8 sm:right-3 sm:top-auto sm:max-w-xs',
      )}
      aria-live="polite"
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute right-1.5 top-1.5 rounded-md p-1 text-loam-400 hover:bg-loam-100 hover:text-loam-700"
        aria-label={t('relief.page.probe.close')}
      >
        <X className="h-3.5 w-3.5" />
      </button>
      <p className="font-semibold text-loam-900">{t('relief.page.probe.altitude', { value: formatNumber(probe.altitude, 1) })}</p>
      {lines}
    </div>
  )
}
