// Ported from Claudy (MIT, © 2022-2023 Fondation Les 4 Sources) — the
// orchestration of Claudy's `map_relief_controller.js` (Stimulus), rewritten
// as a framework-free class the React page drives. The Niva easter egg, the
// "blocks" view, real measured rain (Open-Meteo, non-commercial) and the
// designs traced in 3D are left out: in Designer the designs are the map's
// own features.
//
// The terrain arrives as binary rasters, the three.js scene loads with a
// dynamic `import()`, then everything is computed in the browser: flow axes
// and depressions once (~0.5 s for a million cells), station indices on
// demand (~1 s), the rain step by step while it runs, the shade at an
// instant (~30 ms) or the sun hours of a day (~1-3 s).

import type { Geometry } from 'geojson'
import { CANOPY_MAX, CANOPY_RAMP, FROST_RAMP, HYPSOMETRY, SUN_RAMP, WETNESS_RAMP, hexToRgb, ramp, type RGB } from './colors.ts'
import { applyDesigns, downsampleDesigned, type Design, type Footprint } from './design.ts'
import { polygonMask, toGrid, type GridMeta } from './grid.ts'
import { analyzeDrainage, decodeGrid, downsample, RainSimulation, type Drainage } from './hydro.ts'
import { drawOverlay, type OverlayFeature, type OverlayOptions } from './overlay.ts'
import type { ReliefScene } from './scene.ts'
import { buildSoilMaps, SOIL_STATES, UNKNOWN_CLASS, type SoilState } from './soil.ts'
import {
  boxBlur, compassPoint, frostClass, frostRisk, slopeAspect, spreadAccumulation, wetnessClass, wetnessIndex,
  wetnessThresholdsFor, type Compass, type FrostClass, type WetnessClass,
} from './station.ts'
import { daylightWindow, shadowMask, sunHours, sunPosition, zonedTime, type SunPosition } from './sun.ts'
import type { LandcoverClassData, SoilModel, TerrainGridData } from '@/types/relief'

export type BaseLayer = 'ortho' | 'altitude' | 'canopy' | 'aspect' | 'wetness' | 'frost' | 'landcover'
export type SunMode = 'off' | 'instant' | 'day'
export type SunDate = 'winter' | 'equinox' | 'summer' | 'today'

export type LoadingStep = 'download' | 'drainage' | 'station' | 'designs' | null

export type RainSettings = {
  intensity: number
  duration: number
  soilState: SoilState
  /** Simulated steps per frame, ×2. */
  speed: number
  /** Dig the map's ponds and swales into the terrain. */
  dig: boolean
}

export type RainStats = {
  time: number
  raining: boolean
  intensity: number
  rained: number
  infiltrated: number
  outflow: number
  stored: number
  deepest: number
  /** Share of the terrain (inside the boundary) whose soil is full, or null without a reserve. */
  saturated: number | null
  /** Water on the terrain inside the boundary (m³). */
  kept: number
  comparison: { held: number; gain: number; gainPercent: number; soakedMore: number } | null
}

export type SunInfo =
  | { mode: 'off' }
  | { mode: 'instant'; altitude: number; azimuth: Compass; shadedShare: number; set: boolean }
  | { mode: 'day'; computing: number | null; daylight: number | null }

export type ProbeInfo = {
  altitude: number
  slopePct: number
  aspect: Compass
  wetness: WetnessClass
  frost: FrostClass
  landcover: { label: string; rate: number; storage: number } | null
  above: number | null
  sun: { hours: number; daylight: number } | { inSun: boolean } | null
  drained: number
  hollow: number
  water: { depth: number; speed: number } | null
}

export type DesignSummary = { id: number | string; kind: string; name: string | null; capacity: number; water: number }

type Station = { slope: Float32Array; aspect: Float32Array; wetness: Float32Array; frost: Float32Array; spread: Float32Array }

export type ControllerOptions = {
  container: HTMLElement
  terrain: TerrainGridData
  features: OverlayFeature[]
  boundary: Geometry | null
  landcoverClasses: Record<string, LandcoverClassData>
  soil: SoilModel
  location: [number, number] | null
  timezone: string
  layerColors: Record<string, string>
  /** Narrow screens get a coarser mesh. */
  compact: boolean
  onLoading?: (step: LoadingStep, progress?: number) => void
  onStats?: (stats: RainStats) => void
  onSun?: (info: SunInfo) => void
  onDesigns?: (designs: DesignSummary[]) => void
}

const AXIS_FRAME_BUDGET_MS = 11
const POND_KINDS = new Set(['pond'])
const SWALE_KINDS = new Set(['swale', 'keyline', 'ditch'])
const SWALE_DEFAULTS: Record<string, { width: number; depth: number; berm: number }> = {
  swale: { width: 2, depth: 0.5, berm: 0.4 },
  keyline: { width: 1, depth: 0.3, berm: 0.2 },
  ditch: { width: 1, depth: 0.5, berm: 0 },
}

const nextPaint = () => new Promise((resolve) => setTimeout(resolve, 30))

function numberProp(value: unknown, fallback: number): number {
  const n = typeof value === 'string' ? Number(value) : value
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : fallback
}

export class ReliefController {
  options: ControllerOptions
  meta: GridMeta
  scene: ReliefScene | null = null
  full: { heights: Float32Array; cols: number; rows: number } | null = null
  surface: Float32Array | null = null
  landcover: Uint8Array | null = null
  ground: Float32Array | null = null
  drainage: Drainage | null = null
  station: Station | null = null
  designs: Design[] = []
  footprints: Footprint[] = []
  meshFactor = 1
  zRange: [number, number] = [0, 0]
  disposed = false

  view: OverlayOptions & { base: BaseLayer; exaggeration: number; contour: number; surfaceOn: boolean; particles: boolean } = {
    base: 'ortho', exaggeration: 2.5, contour: 5, axes: true, hollows: true, features: true, surfaceOn: false, particles: true,
  }
  rain: RainSettings = { intensity: 30, duration: 60, soilState: 'normal', speed: 4, dig: true }
  sun: { mode: SunMode; date: SunDate; minutes: number } = { mode: 'off', date: 'summer', minutes: 14 * 60 }

  simulation: RainSimulation | null = null
  baseline: RainSimulation | null = null
  playing = false
  private domainCells: number[] | null = null
  private simCells = new Map<number | string, number[]>()
  private lastStats = 0
  private textures: Partial<Record<BaseLayer, unknown>> = {}
  private tint: Uint8Array | null = null
  private maskBuffer: Uint8Array | null = null
  private levelBuffer: Float32Array | null = null
  lastMask: Uint8Array | null = null
  dayHours: { key: string; hours: Float32Array; daylight: number } | null = null
  private sunAbort: AbortController | null = null

  constructor(options: ControllerOptions) {
    this.options = options
    const t = options.terrain
    this.meta = { west: t.west, north: t.north, step: t.step, cols: t.cols, rows: t.rows, cellSizeM: t.cellSizeM }
    if (!t.files.texture) this.view.base = 'altitude'
  }

  get cell() { return this.meta.cellSizeM }

  // ---- Loading ---------------------------------------------------------------

  async load(): Promise<void> {
    const { terrain, container } = this.options
    this.options.onLoading?.('download')
    const fetchBinary = (url: string | null) => url
      ? fetch(url, { credentials: 'same-origin' }).then((r) => (r.ok ? r.arrayBuffer() : null)).catch(() => null)
      : Promise.resolve(null)
    const [grid, surface, landcover, { ReliefScene }] = await Promise.all([
      fetchBinary(terrain.files.grid),
      fetchBinary(terrain.files.surface),
      fetchBinary(terrain.files.landcover),
      import('./scene.ts'),
    ])
    if (!grid) throw new Error('grid unavailable')
    const encoding = { cols: terrain.cols, rows: terrain.rows, zMin: terrain.zMin, zUnit: terrain.zUnit, nodata: terrain.nodata }
    const heights = decodeGrid(grid, encoding)
    // Without a surface model, the shadows fall from the relief alone.
    this.surface = surface && terrain.surface ? decodeGrid(surface, { ...encoding, zMin: terrain.surface.zMin, zUnit: terrain.surface.zUnit }) : null
    this.landcover = landcover && landcover.byteLength === terrain.cols * terrain.rows ? new Uint8Array(landcover) : null
    if (this.disposed) return

    let zMin = Infinity
    let zMax = -Infinity
    for (const z of heights) { if (z < zMin) zMin = z; if (z > zMax) zMax = z }
    this.full = { heights, cols: terrain.cols, rows: terrain.rows }
    this.zRange = [zMin, zMax]
    // A browser meshes ~1 M vertices comfortably, a phone a quarter of that.
    const budget = this.options.compact ? 250_000 : 1_100_000
    this.meshFactor = Math.max(1, Math.ceil(Math.sqrt((terrain.cols * terrain.rows) / budget)))
    const mesh = downsample(heights, terrain.cols, terrain.rows, this.meshFactor)
    this.view.exaggeration = this.defaultExaggeration()
    this.scene = new ReliefScene(container, {
      heights: mesh.heights, cols: mesh.cols, rows: mesh.rows, cellSize: this.cell * this.meshFactor,
      zBase: Math.floor(zMin) - 1, zMid: (zMin + zMax) / 2,
    })
    this.scene.setExaggeration(this.view.exaggeration)
    this.scene.setContourInterval(this.view.contour)
    this.scene.onFrame = () => this.tick()

    this.options.onLoading?.('drainage')
    await nextPaint()
    this.designs = this.designsFromFeatures()
    this.reshape({ keepMesh: !this.designs.length || !this.rain.dig })
    await this.applyBase()
    this.drawOverlay()
    this.options.onLoading?.(null)
  }

  /** Vertical relief ≈ 8 % of the horizontal span: flat gardens get more. */
  private defaultExaggeration(): number {
    const span = Math.max(this.meta.cols, this.meta.rows) * this.cell
    const drop = Math.max(0.5, this.zRange[1] - this.zRange[0])
    return Math.min(5, Math.max(1, Math.round(((0.08 * span) / drop) * 2) / 2))
  }

  dispose() {
    this.disposed = true
    this.sunAbort?.abort()
    this.scene?.dispose()
    this.scene = null
  }

  // ---- The map's water design, dug into the relief -------------------------

  private designsFromFeatures(): Design[] {
    const designs: Design[] = []
    for (const feature of this.options.features) {
      const props = (feature.properties ?? {}) as Record<string, unknown>
      if (props.status && props.status !== 'active') continue
      const kind = String(props.kind ?? '')
      const id = (props.id as number | string | undefined) ?? designs.length
      const geometry = feature.geometry
      if (POND_KINDS.has(kind) && geometry?.type === 'Polygon') {
        designs.push({
          id, type: 'pond', ring: geometry.coordinates[0].map((p) => toGrid(this.meta, p)),
          depth: numberProp(props.depth, 1), berm: numberProp(props.berm, 0.3),
        })
      } else if (SWALE_KINDS.has(kind) && geometry?.type === 'LineString') {
        const defaults = SWALE_DEFAULTS[kind]
        designs.push({
          id, type: 'swale', points: geometry.coordinates.map((p) => toGrid(this.meta, p)),
          width: numberProp(props.width, defaults.width), depth: numberProp(props.depth, defaults.depth),
          berm: props.berm === 0 ? 0 : numberProp(props.berm, defaults.berm),
        })
      }
    }
    return designs
  }

  get hasDesigns() { return this.designs.length > 0 }

  /** The dug relief and all that depends on it: mesh, axes, station, simulations. */
  reshape({ keepMesh = false }: { keepMesh?: boolean } = {}) {
    if (!this.full) return
    const { heights, cols, rows } = this.full
    if (this.rain.dig && this.designs.length) {
      const result = applyDesigns(heights, cols, rows, this.cell, this.designs)
      this.ground = result.heights
      this.footprints = result.footprints
    } else {
      this.ground = heights
      this.footprints = []
    }
    if (!keepMesh) this.applySurfaceHeights()
    this.drainage = analyzeDrainage(this.ground, cols, rows, this.cell)
    this.station = null
    for (const key of ['aspect', 'wetness', 'frost'] as BaseLayer[]) delete this.textures[key]
    if (this.simulation) {
      this.buildSimulations()
      this.scene?.clearWater()
    }
    this.emitDesigns()
  }

  async setDig(dig: boolean) {
    if (this.rain.dig === dig) return
    this.rain.dig = dig
    this.options.onLoading?.('designs')
    await nextPaint()
    this.reshape()
    await this.applyBase()
    this.drawOverlay()
    this.options.onLoading?.(null)
  }

  private emitDesigns() {
    const byId = new Map(this.options.features.map((f) => [f.properties && (f.properties as Record<string, unknown>).id, f]))
    this.options.onDesigns?.(this.footprints.map((footprint) => {
      const props = (byId.get(footprint.id)?.properties ?? {}) as Record<string, unknown>
      return {
        id: footprint.id, kind: String(props.kind ?? ''), name: (props.name as string | null) ?? null,
        capacity: footprint.capacity, water: this.designWater(footprint.id),
      }
    }))
  }

  // ---- The view ---------------------------------------------------------------

  async setBase(base: BaseLayer) {
    this.view.base = base
    await this.applyBase()
  }

  private async applyBase() {
    const scene = this.scene
    if (!scene || !this.full) return
    const base = this.view.base
    if (base === 'aspect' || base === 'wetness' || base === 'frost') {
      await this.ensureStation()
      this.textures[base] ||= scene.canvasTexture(this.stationCanvas(base))
    } else if (base === 'landcover' && this.landcover) {
      this.textures.landcover ||= scene.canvasTexture(this.landcoverCanvas())
    } else if (base === 'canopy' && this.surface) {
      this.textures.canopy ||= scene.canvasTexture(this.canopyCanvas())
    } else if (base === 'ortho' && this.options.terrain.files.texture) {
      this.textures.ortho ||= await scene.loadImageTexture(this.options.terrain.files.texture).catch(() => null)
    }
    const texture = this.textures[base]
    if (texture) return scene.setBaseTexture(texture as Parameters<ReliefScene['setBaseTexture']>[0])
    this.textures.altitude ||= scene.canvasTexture(this.hypsometryCanvas())
    scene.setBaseTexture(this.textures.altitude as Parameters<ReliefScene['setBaseTexture']>[0])
  }

  setExaggeration(value: number) {
    this.view.exaggeration = value
    this.scene?.setExaggeration(value)
    if (this.view.surfaceOn) this.applySurfaceHeights()
  }

  setContour(meters: number) {
    this.view.contour = meters
    this.scene?.setContourInterval(meters)
  }

  setOverlay(options: Partial<OverlayOptions>) {
    Object.assign(this.view, options)
    this.drawOverlay()
  }

  setParticles(on: boolean) {
    this.view.particles = on
    if (this.scene) this.scene.particlesOn = on
  }

  /** The mesh shows trees and roofs, or the bare terrain. */
  setSurface(on: boolean) {
    this.view.surfaceOn = on
    this.applySurfaceHeights()
  }

  /**
   * The terrain is exaggerated, trees and roofs are not: the scene's group
   * multiplies every height by the exaggeration, so what stands above the
   * ground is divided beforehand. A 30 m oak stays a 30 m oak.
   */
  private applySurfaceHeights() {
    if (!this.scene || !this.full) return
    const ground = this.ground ?? this.full.heights
    let heights: Float32Array = ground
    if (this.surface && this.view.surfaceOn) {
      const original = this.full.heights
      const ex = this.view.exaggeration || 1
      heights = new Float32Array(ground.length)
      for (let i = 0; i < ground.length; i++) heights[i] = ground[i] + Math.max(0, this.surface[i] - original[i]) / ex
    }
    this.scene.setHeights(downsample(heights, this.full.cols, this.full.rows, this.meshFactor).heights)
  }

  resetView() { this.scene?.resetView() }
  topView() { this.scene?.topView() }

  drawOverlay() {
    if (!this.scene) return
    drawOverlay(this.scene.overlayCanvas, this.meta, {
      drainage: this.drainage,
      options: this.view,
      features: this.options.features,
      boundary: this.options.boundary,
      colors: this.options.layerColors,
    })
    this.scene.refreshOverlay()
  }

  // ---- Station (slope, aspect, wetness, frost) ------------------------------

  async ensureStation(): Promise<Station | null> {
    if (this.station) return this.station
    if (!this.full || !this.drainage || !this.ground) return null
    this.options.onLoading?.('station')
    await nextPaint()
    const { cols, rows } = this.full
    const { slope, aspect } = slopeAspect(this.ground, cols, rows, this.cell)
    const spread = spreadAccumulation(this.drainage, cols, rows, this.cell)
    const blur = Math.max(1, Math.round(2 / this.cell))
    const wetness = boxBlur(wetnessIndex(spread, slope, this.cell), cols, rows, blur)
    const frost = boxBlur(frostRisk(this.ground, this.drainage), cols, rows, blur)
    this.station = { slope, aspect, wetness, frost, spread }
    this.options.onLoading?.(null)
    return this.station
  }

  private rasterCanvas(color: (i: number) => RGB): HTMLCanvasElement {
    const { cols, rows } = this.meta
    const canvas = document.createElement('canvas')
    canvas.width = cols
    canvas.height = rows
    const context = canvas.getContext('2d')
    if (!context) return canvas
    const image = context.createImageData(cols, rows)
    const data = image.data
    for (let i = 0; i < cols * rows; i++) {
      const [r, g, b] = color(i)
      data[i * 4] = r
      data[i * 4 + 1] = g
      data[i * 4 + 2] = b
      data[i * 4 + 3] = 255
    }
    context.putImageData(image, 0, 0)
    return canvas
  }

  private stationCanvas(kind: 'aspect' | 'wetness' | 'frost'): HTMLCanvasElement {
    const station = this.station as Station
    const { slope, aspect, wetness, frost } = station
    const [low] = wetnessThresholdsFor(this.cell)
    return this.rasterCanvas((i) => {
      if (kind === 'aspect') {
        // From north (blue) to south (orange) through east and west
        // (neutral); a gentle slope tends to grey.
        const southness = -Math.cos(aspect[i])
        const strength = Math.min(1, Math.tan(slope[i]) / 0.25)
        const tone: RGB = southness >= 0 ? [232, 119, 46] : [59, 111, 182]
        const neutral: RGB = [222, 216, 200]
        const t = Math.abs(southness) * strength
        return neutral.map((v, j) => Math.round(v + (tone[j] - v) * t)) as RGB
      }
      if (kind === 'wetness') return ramp((wetness[i] - (low - 1.5)) / 9, WETNESS_RAMP)
      return ramp(frost[i], FROST_RAMP)
    })
  }

  private landcoverCanvas(): HTMLCanvasElement {
    const classes = this.options.landcoverClasses
    const colors = new Map<number, RGB>(Object.entries(classes).map(([code, value]) => [Number(code), hexToRgb(value.color)]))
    const unknown = hexToRgb(UNKNOWN_CLASS.color)
    const landcover = this.landcover as Uint8Array
    return this.rasterCanvas((i) => colors.get(landcover[i]) ?? unknown)
  }

  private canopyCanvas(): HTMLCanvasElement {
    const { heights } = this.full!
    const surface = this.surface as Float32Array
    return this.rasterCanvas((i) => ramp(Math.max(0, surface[i] - heights[i]) / CANOPY_MAX, CANOPY_RAMP))
  }

  private hypsometryCanvas(): HTMLCanvasElement {
    const { heights } = this.full!
    const [zMin, zMax] = this.zRange
    const span = Math.max(1, zMax - zMin)
    return this.rasterCanvas((i) => ramp((heights[i] - zMin) / span, HYPSOMETRY))
  }

  // ---- The rain ---------------------------------------------------------------

  /**
   * Simulation grid: cells of at least 2 m (a 1 m grid oscillates at a
   * usable time step) and at most ~250,000 of them, so an hour of storm runs
   * in under a minute.
   */
  get simFactor(): number {
    const { cols, rows } = this.meta
    return Math.max(Math.ceil(2 / this.cell - 1e-9), Math.ceil(Math.sqrt((cols * rows) / 250_000)), 1)
  }

  /** Time step: stable up to ~1 s on a 2 m cell, 0.5 s is safe. */
  get simDt(): number {
    return Math.min(1, 0.25 * this.cell * this.simFactor)
  }

  private soilMaps() {
    const { soil, landcoverClasses } = this.options
    return buildSoilMaps(this.meta.cols, this.meta.rows, this.simFactor, this.landcover, landcoverClasses, {
      uniformRate: soil.uniformRate, storage: soil.storage, rateFactor: soil.rateFactor, storageFactor: soil.storageFactor,
    })
  }

  private simOptions(maps: { rate: Float32Array; storage: Float32Array }) {
    return {
      intensity: this.rain.intensity,
      duration: this.rain.duration,
      infiltration: this.options.soil.uniformRate * this.options.soil.rateFactor,
      infiltrationMap: maps.rate,
      storageMap: maps.storage,
      initialFill: SOIL_STATES[this.rain.soilState] ?? 0.5,
      percolation: this.options.soil.percolation,
    }
  }

  /** The dug terrain, and the current terrain beside it to compare (when there are designs). */
  buildSimulations() {
    if (!this.full || !this.ground) return
    const { heights, cols, rows } = this.full
    const factor = this.simFactor
    const size = this.cell * factor
    const base = downsample(heights, cols, rows, factor)
    const dug = this.footprints.length > 0
    const designed = dug ? downsampleDesigned(heights, this.ground, cols, rows, factor) : base.heights
    const maps = this.soilMaps()
    this.simulation = new RainSimulation(designed, base.cols, base.rows, size, this.simOptions(maps))
    this.baseline = dug ? new RainSimulation(base.heights, base.cols, base.rows, size, this.simOptions(maps)) : null
    this.domainCells = null
    this.simCells.clear()
    for (const footprint of this.footprints) this.simCells.set(footprint.id, this.toSimCells(footprint.cells))
    this.playing = false
    this.emitStats()
  }

  setRain(settings: Partial<RainSettings>) {
    const rebuild = settings.soilState !== undefined && settings.soilState !== this.rain.soilState
    Object.assign(this.rain, settings)
    if (rebuild && this.simulation) {
      this.buildSimulations()
      this.scene?.clearWater()
      return
    }
    if (this.simulation) {
      const options = { intensity: this.rain.intensity, duration: this.rain.duration }
      this.simulation.setOptions(options)
      this.baseline?.setOptions(options)
    }
    this.emitStats()
  }

  play() {
    if (!this.scene) return
    if (!this.simulation) this.buildSimulations()
    this.playing = true
  }

  pause() { this.playing = false }

  resetRain() {
    this.playing = false
    this.simulation?.reset()
    this.baseline?.reset()
    this.scene?.clearWater()
    this.emitStats()
    this.emitDesigns()
  }

  /** Called on every frame by the scene: as many steps as the budget allows. */
  private tick() {
    const sim = this.simulation
    if (!sim || !this.playing || !this.scene) return
    const start = performance.now()
    const steps = this.rain.speed * 2
    for (let s = 0; s < steps; s++) {
      sim.step(this.simDt)
      this.baseline?.step(this.simDt)
      if (performance.now() - start > AXIS_FRAME_BUDGET_MS) break
    }
    this.scene.updateWater(sim)
    this.scene.updateParticles(sim)
    const now = performance.now()
    if (now - this.lastStats > 250) {
      this.lastStats = now
      this.emitStats()
      if (this.footprints.length) this.emitDesigns()
    }
  }

  private toSimCells(cells: number[]): number[] {
    const { cols } = this.meta
    const factor = this.simFactor
    const simCols = Math.floor(cols / factor)
    const simRows = Math.floor(this.meta.rows / factor)
    const set = new Set<number>()
    for (const i of cells) {
      const c = Math.floor((i % cols) / factor)
      const r = Math.floor(Math.floor(i / cols) / factor)
      if (c < simCols && r < simRows) set.add(r * simCols + c)
    }
    return [...set]
  }

  /** Water in a design's footprint (m³). */
  private designWater(id: number | string): number {
    const sim = this.simulation
    const cells = this.simCells.get(id)
    if (!sim || !cells) return 0
    let volume = 0
    for (const i of cells) volume += sim.depth[i]
    return volume * sim.cellSize * sim.cellSize
  }

  /** Simulation cells inside the map's boundary (the margin excluded). */
  private domain(sim: RainSimulation): number[] {
    if (!this.domainCells) {
      const mask = polygonMask(this.meta, this.options.boundary, this.simFactor)
      const cells: number[] = []
      for (let i = 0; i < mask.length && i < sim.depth.length; i++) if (mask[i]) cells.push(i)
      this.domainCells = cells
    }
    return this.domainCells
  }

  private domainWater(sim: RainSimulation): number {
    let volume = 0
    for (const i of this.domain(sim)) volume += sim.depth[i]
    return volume * sim.cellSize * sim.cellSize
  }

  private saturatedShare(sim: RainSimulation): number | null {
    const storage = sim.options.storageMap
    if (!storage) return null
    const cells = this.domain(sim)
    let full = 0
    for (const i of cells) if (storage[i] > 0 && sim.soil[i] * 1000 >= storage[i] * 0.98) full++
    return cells.length ? full / cells.length : 0
  }

  stats(): RainStats | null {
    const sim = this.simulation
    if (!sim) return null
    let deepest = 0
    for (const d of sim.depth) if (d > deepest) deepest = d
    let comparison: RainStats['comparison'] = null
    const base = this.baseline
    if (base && this.footprints.length) {
      const held = this.footprints.reduce((sum, f) => sum + this.designWater(f.id), 0)
      const kept = this.domainWater(sim)
      const keptBefore = this.domainWater(base)
      const gain = kept - keptBefore
      comparison = {
        held, gain, gainPercent: keptBefore > 1 ? Math.round((gain / keptBefore) * 100) : 0,
        soakedMore: sim.infiltrated - base.infiltrated,
      }
    }
    return {
      time: sim.time, raining: sim.raining, intensity: sim.intensity,
      rained: sim.rained, infiltrated: sim.infiltrated, outflow: sim.outflow, stored: sim.stored(),
      deepest, saturated: this.saturatedShare(sim), kept: this.domainWater(sim), comparison,
    }
  }

  private emitStats() {
    const stats = this.stats()
    if (stats) this.options.onStats?.(stats)
  }

  // ---- The sun ----------------------------------------------------------------

  get location(): [number, number] {
    const loc = this.options.location
    if (loc) return loc
    const t = this.options.terrain
    // Fallback: the grid's centre.
    const x = t.west + ((t.cols - 1) * t.step) / 2
    const y = t.north - ((t.rows - 1) * t.step) / 2
    const lng = (x / 6378137) * 180 / Math.PI
    const lat = (2 * Math.atan(Math.exp(y / 6378137)) - Math.PI / 2) * 180 / Math.PI
    return [lng, lat]
  }

  /** Local midnight of the chosen day, in the map's time zone. */
  sunDayStart(date: SunDate = this.sun.date): Date {
    const tz = this.options.timezone
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(new Date())
    const year = Number(parts.find((p) => p.type === 'year')?.value) || new Date().getFullYear()
    if (date === 'today') {
      const month = Number(parts.find((p) => p.type === 'month')?.value)
      const day = Number(parts.find((p) => p.type === 'day')?.value)
      return zonedTime(year, month, day, 0, 0, tz)
    }
    // Solstices and equinox, flipped south of the equator.
    const south = this.location[1] < 0
    const [month, day] = date === 'equinox' ? [3, 20] : (date === 'summer') !== south ? [6, 21] : [12, 21]
    return zonedTime(year, month, day, 0, 0, tz)
  }

  /** The hour slider's range for the chosen day: sunrise to sunset, by 5 min. */
  sunWindow(date: SunDate = this.sun.date): { min: number; max: number } {
    const [lng, lat] = this.location
    const window = daylightWindow(lat, lng, this.sunDayStart(date))
    if (!window) return { min: 0, max: 24 * 60 - 5 }
    return { min: Math.floor(window.rise / 5) * 5, max: Math.min(24 * 60 - 5, Math.ceil(window.set / 5) * 5) }
  }

  sunInstant(): Date {
    return new Date(this.sunDayStart().valueOf() + this.sun.minutes * 60000)
  }

  async setSun(settings: Partial<{ mode: SunMode; date: SunDate; minutes: number }>) {
    Object.assign(this.sun, settings)
    await this.renderSun()
  }

  private tintBuffer(): Uint8Array {
    const size = this.meta.cols * this.meta.rows * 4
    if (this.tint?.length !== size) this.tint = new Uint8Array(size)
    return this.tint
  }

  private async renderSun() {
    const scene = this.scene
    if (!scene || !this.full) return
    const { cols, rows } = this.meta
    const surface = this.surface ?? this.full.heights
    const [lng, lat] = this.location
    const mode = this.sun.mode
    if (mode !== 'day') this.sunAbort?.abort()
    if (mode === 'off') {
      scene.setSun(null)
      scene.setSunTint(null)
      this.lastMask = null
      this.options.onSun?.({ mode: 'off' })
      return
    }
    if (mode === 'instant') {
      const sun: SunPosition = sunPosition(this.sunInstant(), lat, lng)
      scene.setSun(sun)
      if (sun.altitude <= 0) {
        this.lastMask = null
        const tint = this.tintBuffer()
        for (let o = 0; o < tint.length; o += 4) { tint[o] = 20; tint[o + 1] = 24; tint[o + 2] = 48; tint[o + 3] = 120 }
        scene.setSunTint(tint, cols, rows)
        this.options.onSun?.({ mode: 'instant', altitude: 0, azimuth: compassPoint(sun.azimuth), shadedShare: 1, set: true })
        return
      }
      this.maskBuffer ||= new Uint8Array(cols * rows)
      this.levelBuffer ||= new Float32Array(cols * rows)
      const mask = shadowMask(surface, cols, rows, this.cell, sun, this.maskBuffer, this.levelBuffer)
      this.lastMask = mask
      const tint = this.tintBuffer()
      let shaded = 0
      for (let i = 0; i < mask.length; i++) {
        const o = i * 4
        if (mask[i]) { tint[o + 3] = 0; continue }
        shaded++
        tint[o] = 18; tint[o + 1] = 22; tint[o + 2] = 58; tint[o + 3] = 175
      }
      scene.setSunTint(tint, cols, rows)
      this.options.onSun?.({
        mode: 'instant', altitude: sun.altitude / (Math.PI / 180), azimuth: compassPoint(sun.azimuth),
        shadedShare: shaded / mask.length, set: false,
      })
      return
    }
    // Hours of sun of the day: computed once per date.
    scene.setSun(null)
    const key = `${this.sun.date}:${this.sunDayStart().toISOString()}`
    if (this.dayHours?.key !== key) {
      this.sunAbort?.abort()
      const abort = new AbortController()
      this.sunAbort = abort
      this.options.onSun?.({ mode: 'day', computing: 0, daylight: null })
      try {
        const result = await sunHours(surface, cols, rows, this.cell, lat, lng, this.sunDayStart(), {
          signal: abort.signal,
          onProgress: (f) => this.options.onSun?.({ mode: 'day', computing: f, daylight: null }),
        })
        this.dayHours = { key, ...result }
      } catch {
        return
      }
      if (this.sun.mode !== 'day' || this.disposed) return
    }
    const { hours, daylight } = this.dayHours!
    const tint = this.tintBuffer()
    for (let i = 0; i < hours.length; i++) {
      const [r, g, b] = ramp(daylight ? hours[i] / daylight : 0, SUN_RAMP)
      const o = i * 4
      tint[o] = r; tint[o + 1] = g; tint[o + 2] = b; tint[o + 3] = 175
    }
    scene.setSunTint(tint, cols, rows)
    this.options.onSun?.({ mode: 'day', computing: null, daylight })
  }

  // ---- The probe: what we know of the point touched ------------------------

  async probe(event: { clientX: number; clientY: number }): Promise<ProbeInfo | null> {
    const scene = this.scene
    if (!scene || !this.full || !this.ground) return null
    const hit = scene.pick(event)
    if (!hit) return null
    const station = await this.ensureStation()
    const { cols, rows } = this.full
    const col = Math.min(cols - 1, hit.col * this.meshFactor)
    const row = Math.min(rows - 1, hit.row * this.meshFactor)
    const i = row * cols + col
    const thresholds = wetnessThresholdsFor(this.cell)
    const classes = this.options.landcoverClasses
    const landcoverClass = this.landcover ? classes[String(this.landcover[i])] : null
    const factor = this.options.soil.rateFactor
    let sun: ProbeInfo['sun'] = null
    if (this.sun.mode === 'day' && this.dayHours) sun = { hours: this.dayHours.hours[i], daylight: this.dayHours.daylight }
    else if (this.sun.mode === 'instant' && this.lastMask) sun = { inSun: this.lastMask[i] === 1 }
    let water: ProbeInfo['water'] = null
    const sim = this.simulation
    if (sim && sim.time > 0) {
      const sc = Math.min(sim.cols - 1, Math.floor(col / this.simFactor))
      const sr = Math.min(sim.rows - 1, Math.floor(row / this.simFactor))
      const k = sr * sim.cols + sc
      // A film under half a millimetre is not water one sees, and the speed
      // of an almost dry cell (flux / depth) means nothing.
      const depth = sim.depth[k]
      if (depth >= 0.0005) water = { depth, speed: depth >= 0.002 ? Math.hypot(sim.velX[k], sim.velY[k]) : 0 }
    }
    return {
      altitude: this.ground[i],
      slopePct: station ? Math.tan(station.slope[i]) * 100 : 0,
      aspect: station ? compassPoint(station.aspect[i]) : 'n',
      wetness: station ? wetnessClass(station.wetness[i], thresholds) : 'fresh',
      frost: station ? frostClass(station.frost[i]) : 'low',
      landcover: landcoverClass
        ? { label: landcoverClass.label, rate: landcoverClass.rate * factor, storage: landcoverClass.storage * this.options.soil.storageFactor }
        : null,
      above: this.surface ? this.surface[i] - this.full.heights[i] : null,
      sun,
      // Spread flow says what really arrives on a slope; the single axis
      // only counts the cell itself outside the thalwegs.
      drained: station?.spread[i] ?? this.drainage?.accumulation[i] ?? 0,
      hollow: this.drainage?.depression[i] ?? 0,
      water,
    }
  }
}
