// Ported from Claudy (MIT, © 2022-2023 Fondation Les 4 Sources)
//
// The 3D scene of the relief: the terrain model as a mesh, draped with the
// ortho or a tint (altitude, station…), with contour lines, flow axes,
// depressions and the map's features as an overlay, the water of the rain
// simulation (a tinted water film + tracers following the current), and the
// sun (shadows at a time or hours of sun over a day, tinted on the terrain,
// with the scene's light where the sun is). Two extras from Claudy: the relief
// in blocks, and the Niva to drive on it, by day or by night.
//
// This module is the ONLY one importing three.js, and the page loads it with
// a dynamic `import()`: other pages don't pay its weight.
//
// Frame: x east, z south, y up, in metres, centred on the grid. Terrain,
// water and tracers live in one group whose vertical scale IS the
// exaggeration: changing it recomputes nothing.

import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { ATLAS_COLUMNS, ATLAS_ROWS, blockAtlas, buildBlocks, type BlocksInput } from './blocks.ts'
import type { BuildingVolume } from './buildings.ts'
import { waterColor } from './colors.ts'
import { NIVA, type NivaState } from './niva.ts'
import { buildNivaModel, nivaParts, setNivaLights, type NivaLights } from './nivaModel.ts'
import type { RainSimulation } from './hydro.ts'
import type { SunPosition } from './sun.ts'

/** Overlay canvas resolution, in pixels per grid cell. */
export const OVERLAY_SCALE = 2
const OVERLAY_MAX_PX = 4096
const PARTICLES = 5000
const WALL_COLOR = '#d8cfc0'
const DAY_SKY = '#e3e9e4'
const NIGHT_SKY = '#0a1220'

export type CameraMode = 'chase' | 'orbit'

export type SceneGrid = {
  heights: Float32Array
  cols: number
  rows: number
  cellSize: number
  /** Height subtracted from every vertex (keeps float precision). */
  zBase: number
  zMid: number
}

// The overlays of the terrain (sun, water, contours, axes and features), read
// at grid coordinates.
const OVERLAY_DECLARATIONS = `uniform float uContour;
uniform sampler2D uOverlay;
uniform sampler2D uWater;
uniform sampler2D uSun;
varying float vElevation;
varying vec2 vGridUv;
float contourLine(float value, float width) {
  float f = abs(fract(value - 0.5) - 0.5) / max(fwidth(value), 1e-5);
  return 1.0 - min(f / width, 1.0);
}`
const OVERLAY_MIX = `vec4 sunTint = texture2D(uSun, vGridUv);
diffuseColor.rgb = mix(diffuseColor.rgb, sunTint.rgb, sunTint.a);
vec4 water = texture2D(uWater, vGridUv);
diffuseColor.rgb = mix(diffuseColor.rgb, water.rgb, water.a);
if (uContour > 0.0) {
  float minor = contourLine(vElevation / uContour, 0.9);
  float major = contourLine(vElevation / (uContour * 5.0), 1.6);
  float line = max(minor * 0.35, major * 0.7);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.28, 0.2, 0.12), line);
}
vec4 overlay = texture2D(uOverlay, vGridUv);
diffuseColor.rgb = mix(diffuseColor.rgb, overlay.rgb, overlay.a);`

function dataTexture(data: Uint8Array, width: number, height: number): THREE.DataTexture {
  const texture = new THREE.DataTexture(data, width, height)
  texture.magFilter = THREE.LinearFilter
  texture.minFilter = THREE.LinearFilter
  texture.colorSpace = THREE.SRGBColorSpace
  texture.needsUpdate = true
  return texture
}

export class ReliefScene {
  container: HTMLElement
  grid: SceneGrid
  exaggeration = 2.5
  particlesOn = true
  size: { width: number; depth: number }
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  world: THREE.Group
  camera: THREE.PerspectiveCamera
  controls: OrbitControls
  overlayCanvas: HTMLCanvasElement
  onFrame: (() => void) | null = null
  night = false
  cameraMode: CameraMode = 'chase'

  private hemiLight: THREE.HemisphereLight
  private sunLight: THREE.DirectionalLight
  private terrain!: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>
  private material!: THREE.MeshStandardMaterial
  private overlayTexture!: THREE.CanvasTexture
  private waterData = new Uint8Array(4)
  private waterTexture!: THREE.DataTexture
  private sunData = new Uint8Array(4)
  private sunTexture!: THREE.DataTexture
  private uniforms!: Record<string, THREE.IUniform>
  private particles!: THREE.Points
  private particlePositions = new Float32Array(PARTICLES * 3)
  private particleAge = new Float32Array(PARTICLES)
  private smoothed: Float32Array | null = null
  private resizeObserver: ResizeObserver
  private sunIntensity = 1.9
  private stars: THREE.Points | null = null
  private orbitLimits: { near: number; minDistance: number }
  private blocks: THREE.Mesh | null = null
  private blocksInput: BlocksInput | null = null
  private builtBlocks: { tops: Float32Array; cols: number; rows: number; size: number; cell: number } | null = null
  private blockData: { tops: Float32Array; cols: number; rows: number; size: number; cell: number } | null = null
  private niva: THREE.Group | null = null
  private nivaLights: NivaLights = { low: false, bar: false }
  private nivaBraking = false
  private chaseDistance = 14
  private lastNivaTarget: THREE.Vector3 | null = null
  private onWheel: ((event: WheelEvent) => void) | null = null
  private buildings: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial[]> | null = null
  /** Per building vertex: the ground under it and its height above it (real metres). */
  private buildingFoot: Float32Array | null = null
  private buildingRise: Float32Array | null = null
  private buildingsOn = true

  constructor(container: HTMLElement, grid: SceneGrid) {
    this.container = container
    this.grid = grid
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    container.appendChild(this.renderer.domElement)
    this.renderer.domElement.classList.add('block', 'h-full', 'w-full', 'touch-none')

    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(DAY_SKY)
    this.world = new THREE.Group()
    this.scene.add(this.world)

    const width = (grid.cols - 1) * grid.cellSize
    const depth = (grid.rows - 1) * grid.cellSize
    this.size = { width, depth }
    const span = Math.max(width, depth)
    this.camera = new THREE.PerspectiveCamera(40, 1, Math.max(0.5, span / 400), span * 8)
    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = true
    this.controls.maxPolarAngle = Math.PI * 0.47
    this.controls.minDistance = Math.max(5, span / 40)
    this.controls.maxDistance = span * 3
    this.orbitLimits = { near: this.camera.near, minDistance: this.controls.minDistance }

    // The default light comes from the north-west, as on every hillshade:
    // the convention the eye reads as "hollow / bump".
    this.hemiLight = new THREE.HemisphereLight('#f4f7fb', '#5b5140', 1.1)
    this.scene.add(this.hemiLight)
    this.sunLight = new THREE.DirectionalLight('#fffaf0', 1.9)
    this.scene.add(this.sunLight)
    this.setSun(null)

    this.overlayCanvas = document.createElement('canvas')
    this.buildTerrain()
    this.buildParticles()
    this.resetView()

    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(container)
    this.resize()
    this.renderer.setAnimationLoop(() => this.frame())
  }

  /** The mesh: one vertex per cell, two triangles per square. */
  private buildTerrain() {
    const { heights, cols, rows, cellSize, zBase } = this.grid
    const count = cols * rows
    const positions = new Float32Array(count * 3)
    const uvs = new Float32Array(count * 2)
    const elevation = new Float32Array(count)
    const x0 = ((cols - 1) * cellSize) / 2
    const z0 = ((rows - 1) * cellSize) / 2
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c
        positions[i * 3] = c * cellSize - x0
        positions[i * 3 + 1] = heights[i] - zBase
        positions[i * 3 + 2] = r * cellSize - z0
        uvs[i * 2] = c / (cols - 1)
        uvs[i * 2 + 1] = 1 - r / (rows - 1)
        elevation[i] = heights[i]
      }
    }
    const indices = new Uint32Array((cols - 1) * (rows - 1) * 6)
    let k = 0
    for (let r = 0; r < rows - 1; r++) {
      for (let c = 0; c < cols - 1; c++) {
        const a = r * cols + c
        const b = a + 1
        const d = a + cols
        const e = d + 1
        indices[k++] = a; indices[k++] = d; indices[k++] = b
        indices[k++] = b; indices[k++] = d; indices[k++] = e
      }
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
    geometry.setAttribute('elevation', new THREE.BufferAttribute(elevation, 1))
    geometry.setIndex(new THREE.BufferAttribute(indices, 1))
    geometry.computeVertexNormals()
    geometry.computeBoundingSphere()

    // Overlays (axes, depressions, features): a canvas at 2× the grid.
    const scale = Math.max(1, Math.min(OVERLAY_SCALE, OVERLAY_MAX_PX / Math.max(cols, rows)))
    this.overlayCanvas.width = Math.round(cols * scale)
    this.overlayCanvas.height = Math.round(rows * scale)
    this.overlayTexture = new THREE.CanvasTexture(this.overlayCanvas)
    this.overlayTexture.colorSpace = THREE.SRGBColorSpace
    this.overlayTexture.anisotropy = 4

    // Water and sun: RGBA textures refreshed by `updateWater` / `setSunTint`.
    this.waterTexture = dataTexture(this.waterData, 1, 1)
    this.sunTexture = dataTexture(this.sunData, 1, 1)

    this.uniforms = {
      uContour: { value: 5 },
      uOverlay: { value: this.overlayTexture },
      uWater: { value: this.waterTexture },
      uSun: { value: this.sunTexture },
    }
    const placeholder = new THREE.DataTexture(new Uint8Array([200, 200, 190, 255]), 1, 1)
    placeholder.needsUpdate = true
    this.material = new THREE.MeshStandardMaterial({ map: placeholder, roughness: 1, metalness: 0 })
    this.material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms)
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float elevation;\nvarying float vElevation;\nvarying vec2 vGridUv;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvElevation = elevation;\nvGridUv = uv;')
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${OVERLAY_DECLARATIONS}`)
        .replace('#include <map_fragment>', `#include <map_fragment>\n${OVERLAY_MIX}`)
    }
    this.terrain = new THREE.Mesh(geometry, this.material)
    this.world.add(this.terrain)
  }

  private buildParticles() {
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(this.particlePositions, 3))
    geometry.setDrawRange(0, 0)
    this.particles = new THREE.Points(geometry, new THREE.PointsMaterial({
      color: '#e0f2fe', size: 2.5, sizeAttenuation: false, transparent: true, opacity: 0.9,
    }))
    this.particles.frustumCulled = false
    this.world.add(this.particles)
  }

  // ---- The relief in blocks -------------------------------------------------
  //
  // A second, cubic mesh (blocks.ts) replaces the terrain on screen. The
  // overlays (water, sun, axes, features) are read at the same grid
  // coordinates, derived from the position; the smooth terrain stays in
  // place, hidden, for the probe and placing the Niva.

  /** Build (or show again) the blocks; returns the number of faces. */
  showBlocks(input: BlocksInput): number {
    if (this.blocks && this.blocksInput === input) {
      this.revealBlocks()
      return 0
    }
    const g = this.grid
    const x0 = ((g.cols - 1) * g.cellSize) / 2
    const z0 = ((g.rows - 1) * g.cellSize) / 2
    const built = buildBlocks({ ...input, zBase: g.zBase, x0, z0 })
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(built.positions, 3))
    geometry.setAttribute('normal', new THREE.BufferAttribute(built.normals, 3, true))
    geometry.setAttribute('blockUv', new THREE.BufferAttribute(built.uvs, 2))
    geometry.setAttribute('tile', new THREE.BufferAttribute(built.tiles, 1))
    geometry.setIndex(new THREE.BufferAttribute(built.indices, 1))
    geometry.computeBoundingSphere()
    if (this.blocks) {
      this.blocks.geometry.dispose()
      this.blocks.geometry = geometry
    } else {
      this.blocks = new THREE.Mesh(geometry, this.blockMaterial())
      this.world.add(this.blocks)
    }
    this.blocksInput = input
    this.builtBlocks = { tops: built.groundTops, cols: built.cols, rows: built.rows, size: built.size, cell: input.cell }
    this.revealBlocks()
    return built.faces
  }

  private revealBlocks() {
    if (!this.blocks) return
    this.blockData = this.builtBlocks
    this.blocks.visible = true
    this.terrain.visible = false
    if (this.buildings) this.buildings.visible = false
  }

  hideBlocks() {
    if (!this.blocks) return
    this.blocks.visible = false
    this.terrain.visible = true
    this.blockData = null
    if (this.buildings) this.buildings.visible = this.buildingsOn
  }

  /** The top of the block ground (exaggerated group frame) under a point in metres from the north-west corner, or null outside blocks. */
  private blockTop(x: number, z: number): number | null {
    const data = this.blockData
    if (!data) return null
    const { cell } = data
    const i = Math.min(data.cols - 1, Math.max(0, Math.floor((x + cell / 2) / data.size)))
    const j = Math.min(data.rows - 1, Math.max(0, Math.floor((z + cell / 2) / data.size)))
    return data.tops[j * data.cols + i]
  }

  private blockMaterial(): THREE.MeshStandardMaterial {
    const { canvas, averages } = blockAtlas()
    const atlas = new THREE.CanvasTexture(canvas)
    atlas.colorSpace = THREE.SRGBColorSpace
    atlas.magFilter = THREE.NearestFilter
    atlas.minFilter = THREE.NearestFilter
    atlas.generateMipmaps = false
    atlas.flipY = false
    // The mean colours, linear like the decoded texels.
    const linear: THREE.Color[] = []
    for (let t = 0; t < averages.length / 3; t++) {
      linear.push(new THREE.Color().setRGB(averages[t * 3], averages[t * 3 + 1], averages[t * 3 + 2], THREE.SRGBColorSpace))
    }
    const g = this.grid
    const half = new THREE.Vector2(((g.cols - 1) * g.cellSize) / 2, ((g.rows - 1) * g.cellSize) / 2)
    const uniforms = {
      ...this.uniforms,
      uContour: { value: 0 },
      uAtlas: { value: atlas },
      uTileAverage: { value: linear },
      uHalf: { value: half },
      uSize: { value: half.clone().multiplyScalar(2) },
    }
    const material = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0 })
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms)
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
attribute vec2 blockUv;
attribute float tile;
uniform vec2 uHalf;
uniform vec2 uSize;
varying float vElevation;
varying vec2 vGridUv;
varying vec2 vBlockUv;
flat varying int vTile;`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
vElevation = 0.0;
vGridUv = vec2((position.x + uHalf.x) / uSize.x, 1.0 - (position.z + uHalf.y) / uSize.y);
vBlockUv = blockUv;
vTile = int(tile + 0.5);`)
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
${OVERLAY_DECLARATIONS}
uniform sampler2D uAtlas;
uniform vec3 uTileAverage[${ATLAS_COLUMNS * ATLAS_ROWS}];
varying vec2 vBlockUv;
flat varying int vTile;`)
        .replace('#include <map_fragment>', `vec2 inTile = vec2(fract(vBlockUv.x), 1.0 - fract(vBlockUv.y));
vec2 cellOf = vec2(float(vTile % ${ATLAS_COLUMNS}), float(vTile / ${ATLAS_COLUMNS}));
vec3 texel = texture2D(uAtlas, (cellOf + inTile) / vec2(${ATLAS_COLUMNS}.0, ${ATLAS_ROWS}.0)).rgb;
// From afar, sixteen pixels per block fall under the pixel: the tile's mean
// colour replaces the shimmer.
vec2 spread = fwidth(vBlockUv) * 16.0;
texel = mix(texel, uTileAverage[vTile], smoothstep(0.6, 1.6, max(spread.x, spread.y)));
diffuseColor.rgb *= texel;
${OVERLAY_MIX}`)
    }
    return material
  }

  setBaseTexture(texture: THREE.Texture) {
    texture.colorSpace = THREE.SRGBColorSpace
    texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy()
    this.material.map = texture
    this.material.needsUpdate = true
    if (this.buildings) {
      this.buildings.material[0].map = texture
      this.buildings.material[0].needsUpdate = true
    }
  }

  loadImageTexture(url: string): Promise<THREE.Texture> {
    return new THREE.TextureLoader().loadAsync(url)
  }

  canvasTexture(canvas: HTMLCanvasElement): THREE.Texture {
    return new THREE.CanvasTexture(canvas)
  }

  setExaggeration(value: number) {
    this.exaggeration = value
    this.world.scale.y = value
    this.placeBuildings()
  }

  // ---- Buildings ----------------------------------------------------------
  //
  // Clean volumes (footprint × height) standing on the exaggerated relief at
  // their real height: the group multiplies every height by the
  // exaggeration, so the rise is divided beforehand. Roofs are draped with
  // the terrain's base (the ortho shows the real roof), walls are plain.

  /** Build the buildings' mesh from their volumes (grid metres); null removes it. */
  setBuildings(volumes: BuildingVolume[] | null) {
    if (this.buildings) {
      this.world.remove(this.buildings)
      this.buildings.geometry.dispose()
      for (const material of this.buildings.material) material.dispose()
      this.buildings = null
    }
    if (!volumes?.length) return
    const { width, depth } = this.size
    const x0 = width / 2
    const z0 = depth / 2
    const positions: number[] = []
    const normals: number[] = []
    const uvs: number[] = []
    const foot: number[] = []
    const rise: number[] = []
    const roofIndices: number[] = []
    const wallIndices: number[] = []
    const vertex = (x: number, y: number, base: number, up: number, n: [number, number, number]) => {
      positions.push(x - x0, 0, y - z0)
      normals.push(...n)
      uvs.push(x / width, 1 - y / depth)
      foot.push(base - this.grid.zBase)
      rise.push(up)
      return positions.length / 3 - 1
    }
    for (const volume of volumes) {
      for (const raw of volume.rings) {
        const ring = raw.slice(0, -1)
        if (ring.length < 3) continue
        // One winding for all rings, so the wall normals below face outwards.
        let area = 0
        for (let k = 0; k < ring.length; k++) {
          const a = ring[k]
          const b = ring[(k + 1) % ring.length]
          area += a.x * b.y - b.x * a.y
        }
        const points = area > 0 ? ring : [...ring].reverse()
        const contour = points.map((p) => new THREE.Vector2(p.x, p.y))
        const first = positions.length / 3
        for (const p of points) vertex(p.x, p.y, volume.base, volume.height, [0, 1, 0])
        for (const [a, b, c] of THREE.ShapeUtils.triangulateShape(contour, [])) {
          // Facing up: (b − a) × (c − a) points to +y.
          const [p, q, r] = [points[a], points[b], points[c]]
          const up = (q.y - p.y) * (r.x - p.x) - (q.x - p.x) * (r.y - p.y)
          if (up > 0) roofIndices.push(first + a, first + b, first + c)
          else roofIndices.push(first + a, first + c, first + b)
        }
        for (let k = 0; k < points.length; k++) {
          const a = points[k]
          const b = points[(k + 1) % points.length]
          const len = Math.hypot(b.x - a.x, b.y - a.y) || 1
          const n: [number, number, number] = [(b.y - a.y) / len, 0, -(b.x - a.x) / len]
          const a0 = vertex(a.x, a.y, volume.base, volume.bottom, n)
          const b0 = vertex(b.x, b.y, volume.base, volume.bottom, n)
          const a1 = vertex(a.x, a.y, volume.base, volume.height, n)
          const b1 = vertex(b.x, b.y, volume.base, volume.height, n)
          wallIndices.push(a0, a1, b0, b0, a1, b1)
        }
      }
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3))
    geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(normals), 3))
    geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvs), 2))
    geometry.setIndex([...roofIndices, ...wallIndices])
    geometry.addGroup(0, roofIndices.length, 0)
    geometry.addGroup(roofIndices.length, wallIndices.length, 1)
    const roof = new THREE.MeshStandardMaterial({ map: this.material.map, roughness: 1, metalness: 0, side: THREE.DoubleSide })
    const walls = new THREE.MeshStandardMaterial({ color: WALL_COLOR, roughness: 1, metalness: 0, side: THREE.DoubleSide })
    this.buildings = new THREE.Mesh(geometry, [roof, walls])
    this.buildingFoot = new Float32Array(foot)
    this.buildingRise = new Float32Array(rise)
    this.buildings.visible = this.buildingsOn && this.terrain.visible
    this.world.add(this.buildings)
    this.placeBuildings()
  }

  showBuildings(on: boolean) {
    this.buildingsOn = on
    if (this.buildings) this.buildings.visible = on && this.terrain.visible
  }

  private placeBuildings() {
    if (!this.buildings || !this.buildingFoot || !this.buildingRise) return
    const positions = this.buildings.geometry.attributes.position.array as Float32Array
    const ex = this.exaggeration || 1
    for (let i = 0; i < this.buildingFoot.length; i++) positions[i * 3 + 1] = this.buildingFoot[i] + this.buildingRise[i] / ex
    this.buildings.geometry.attributes.position.needsUpdate = true
    this.buildings.geometry.computeBoundingSphere()
  }

  /** Replace the mesh heights (bare terrain ↔ trees and roofs) without rebuilding. */
  setHeights(heights: ArrayLike<number>) {
    const { zBase } = this.grid
    const geometry = this.terrain.geometry
    const positions = geometry.attributes.position.array as Float32Array
    const elevation = geometry.attributes.elevation.array as Float32Array
    for (let i = 0; i < heights.length; i++) {
      positions[i * 3 + 1] = heights[i] - zBase
      elevation[i] = heights[i]
    }
    geometry.attributes.position.needsUpdate = true
    geometry.attributes.elevation.needsUpdate = true
    geometry.computeVertexNormals()
    geometry.computeBoundingSphere()
  }

  /**
   * The scene's light comes from the real sun (azimuth from north); without
   * a sun, from the north-west, the convention of relief shading.
   */
  setSun(sun: SunPosition | null) {
    const width = this.size?.width ?? 100
    const depth = this.size?.depth ?? 100
    const distance = width * 1.5
    if (!sun || sun.altitude <= 0) {
      this.sunLight.position.set(-width, width * 0.9, -depth)
      this.sunIntensity = 1.9
      this.applyLighting()
      return
    }
    const horizontal = Math.cos(sun.altitude) * distance
    this.sunLight.position.set(Math.sin(sun.azimuth) * horizontal, Math.sin(sun.altitude) * distance,
                               -Math.cos(sun.azimuth) * horizontal)
    this.sunIntensity = 2.2
    this.applyLighting()
  }

  /** One RGBA tint per grid cell (rows north → south) laid on the terrain; null clears it. */
  setSunTint(rgba: Uint8Array | null, cols = 1, rows = 1) {
    if (!rgba) {
      this.sunData.fill(0)
      this.sunTexture.needsUpdate = true
      return
    }
    if (this.sunTexture.image.width !== cols || this.sunTexture.image.height !== rows) {
      this.sunTexture.dispose()
      this.sunData = new Uint8Array(cols * rows * 4)
      this.sunTexture = dataTexture(this.sunData, cols, rows)
      this.uniforms.uSun.value = this.sunTexture
    }
    // A DataTexture reads bottom-up: the north row goes last.
    for (let r = 0; r < rows; r++) {
      this.sunData.set(rgba.subarray(r * cols * 4, (r + 1) * cols * 4), (rows - 1 - r) * cols * 4)
    }
    this.sunTexture.needsUpdate = true
  }

  setContourInterval(meters: number) {
    this.uniforms.uContour.value = meters
  }

  refreshOverlay() {
    this.overlayTexture.needsUpdate = true
  }

  /** Starting view: three quarters from the south-west, the terrain in the centre. */
  resetView() {
    const { width, depth } = this.size
    this.setExaggeration(this.exaggeration)
    this.controls.target.set(0, (this.grid.zMid - this.grid.zBase) * this.exaggeration * 0.6, 0)
    this.camera.position.set(-width * 0.42, Math.max(width, depth) * 0.68, depth * 1.05)
    this.controls.update()
  }

  /** Look straight down, north up. */
  topView() {
    const span = Math.max(this.size.width, this.size.depth)
    this.controls.target.set(0, 0, 0)
    this.camera.position.set(0, span * 1.25, 0.001)
    this.controls.update()
  }

  private resize() {
    const { clientWidth, clientHeight } = this.container
    if (!clientWidth || !clientHeight) return
    this.renderer.setSize(clientWidth, clientHeight, false)
    this.camera.aspect = clientWidth / clientHeight
    this.camera.updateProjectionMatrix()
  }

  /**
   * The water film of the simulation in colours: a barely tinted millimetre
   * film, a light blue rill of a few centimetres, a deep blue pond. Smoothed
   * over 3 × 3 cells with a progressive opacity: on a thin film the pipe
   * model wets one cell out of two from one step to the next.
   */
  updateWater(sim: RainSimulation) {
    const { cols, rows } = sim
    const depth = this.smoothedDepth(sim)
    if (this.waterTexture.image.width !== cols || this.waterTexture.image.height !== rows) {
      this.waterTexture.dispose()
      this.waterData = new Uint8Array(cols * rows * 4)
      this.waterTexture = dataTexture(this.waterData, cols, rows)
      this.uniforms.uWater.value = this.waterTexture
    }
    const data = this.waterData
    for (let r = 0; r < rows; r++) {
      const out = (rows - 1 - r) * cols
      for (let c = 0; c < cols; c++) {
        const [red, green, blue, alpha] = waterColor(depth[r * cols + c])
        const o = (out + c) * 4
        data[o] = red
        data[o + 1] = green
        data[o + 2] = blue
        data[o + 3] = alpha
      }
    }
    this.waterTexture.needsUpdate = true
  }

  private smoothedDepth(sim: RainSimulation): Float32Array {
    const { cols, rows, depth } = sim
    if (this.smoothed?.length !== depth.length) this.smoothed = new Float32Array(depth.length)
    const out = this.smoothed
    for (let r = 0; r < rows; r++) {
      const r0 = r > 0 ? r - 1 : r
      const r1 = r + 1 < rows ? r + 1 : r
      for (let c = 0; c < cols; c++) {
        const c0 = c > 0 ? c - 1 : c
        const c1 = c + 1 < cols ? c + 1 : c
        let sum = 0
        let n = 0
        for (let rr = r0; rr <= r1; rr++) {
          for (let cc = c0; cc <= c1; cc++) { sum += depth[rr * cols + cc]; n++ }
        }
        // The cell itself counts double: a pond keeps a crisp shore.
        out[r * cols + c] = (sum + depth[r * cols + c]) / (n + 1)
      }
    }
    return out
  }

  clearWater() {
    this.waterData.fill(0)
    this.waterTexture.needsUpdate = true
    this.particles.geometry.setDrawRange(0, 0)
  }

  /**
   * Tracers follow the water velocity (simulation grid). They are born in a
   * random wet cell and die dry, off the grid or after ~4 s. Their screen
   * speed is proportional to the current, not to simulated time.
   */
  updateParticles(sim: RainSimulation) {
    if (!this.particlesOn) {
      this.particles.geometry.setDrawRange(0, 0)
      return
    }
    const { cols, rows, depth, velX, velY, cellSize } = sim
    const g = this.grid
    const x0 = ((g.cols - 1) * g.cellSize) / 2
    const z0 = ((g.rows - 1) * g.cellSize) / 2
    const pos = this.particlePositions
    const wetFloor = 0.002
    let spawnTries = 0
    for (let p = 0; p < PARTICLES; p++) {
      let x = pos[p * 3] + x0
      let z = pos[p * 3 + 2] + z0
      let c = Math.floor(x / cellSize)
      let r = Math.floor(z / cellSize)
      const alive = this.particleAge[p] > 0 && c >= 0 && r >= 0 && c < cols && r < rows && depth[r * cols + c] > wetFloor
      if (!alive) {
        this.particleAge[p] = 0
        if (spawnTries > 4000) { pos[p * 3 + 1] = -1e6; continue }
        let found = false
        for (let t = 0; t < 8 && !found; t++) {
          spawnTries++
          const i = Math.floor(Math.random() * cols * rows)
          if (depth[i] > wetFloor * 2) {
            c = i % cols
            r = (i - c) / cols
            x = (c + Math.random()) * cellSize
            z = (r + Math.random()) * cellSize
            this.particleAge[p] = 200 + Math.random() * 60
            found = true
          }
        }
        if (!found) { pos[p * 3 + 1] = -1e6; continue }
      }
      const i = r * cols + c
      const vx = velX[i]
      const vz = velY[i]
      const speed = Math.hypot(vx, vz)
      const stepLength = Math.min(speed, 3) * 0.6
      if (speed > 1e-6) {
        x += (vx / speed) * stepLength
        z += (vz / speed) * stepLength
      }
      this.particleAge[p] -= 1
      pos[p * 3] = x - x0
      pos[p * 3 + 2] = z - z0
      pos[p * 3 + 1] = this.heightAt(x, z) - g.zBase + depth[i] + 0.15 / this.exaggeration
    }
    this.particles.geometry.setDrawRange(0, PARTICLES)
    this.particles.geometry.attributes.position.needsUpdate = true
  }

  // ---- The night -------------------------------------------------------------
  //
  // A starry night-blue sky, a haze swallowing the distance, a cold moon: the
  // terrain hardly shows but in the headlights.

  setNight(on: boolean) {
    this.night = on
    ;(this.scene.background as THREE.Color).set(on ? NIGHT_SKY : DAY_SKY)
    this.scene.fog = on ? new THREE.FogExp2(NIGHT_SKY, 0.0016) : null
    if (on && !this.stars) this.buildStars()
    if (this.stars) this.stars.visible = on
    this.applyLighting()
    this.setNivaLights(this.nivaLights)
  }

  private applyLighting() {
    this.hemiLight.intensity = this.night ? 0.07 : 1.1
    this.hemiLight.color.set(this.night ? '#8fa6d6' : '#f4f7fb')
    this.sunLight.intensity = this.night ? 0.14 : this.sunIntensity
    this.sunLight.color.set(this.night ? '#9db4ff' : '#fffaf0')
  }

  private buildStars() {
    const count = 1500
    const radius = Math.max(this.size.width, this.size.depth) * 3
    const positions = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      const azimuth = Math.random() * Math.PI * 2
      const height = 0.08 + Math.random() * 0.92
      const ring = Math.sqrt(1 - height * height)
      positions.set([Math.cos(azimuth) * ring * radius, height * radius, Math.sin(azimuth) * ring * radius], i * 3)
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    this.stars = new THREE.Points(geometry, new THREE.PointsMaterial({
      color: '#dbe4ff', size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0.85, fog: false,
    }))
    this.stars.frustumCulled = false
    this.scene.add(this.stars)
  }

  // ---- The Niva ----------------------------------------------------------------
  //
  // The car lives outside the exaggerated group: it keeps its real size, set
  // at the height of the exaggerated relief and tilted on its exaggerated
  // slope, to stick to the terrain one sees. The camera follows it ("chase")
  // or turns around it with the mouse ("orbit").

  showNiva(on: boolean) {
    if (on) {
      this.niva ||= buildNivaModel()
      this.scene.add(this.niva)
      this.setNivaLights(this.nivaLights)
      this.camera.near = 0.3
      this.controls.minDistance = 4
      this.setCameraMode(this.cameraMode)
      if (!this.onWheel) {
        this.onWheel = (event: WheelEvent) => {
          if (this.cameraMode !== 'chase' || !this.niva?.parent) return
          event.preventDefault()
          this.chaseDistance = Math.min(80, Math.max(6, this.chaseDistance * (event.deltaY > 0 ? 1.12 : 0.89)))
        }
        this.renderer.domElement.addEventListener('wheel', this.onWheel, { passive: false })
      }
    } else if (this.niva) {
      this.scene.remove(this.niva)
      this.camera.near = this.orbitLimits.near
      this.controls.minDistance = this.orbitLimits.minDistance
      this.controls.enabled = true
    }
    this.camera.updateProjectionMatrix()
  }

  setCameraMode(mode: CameraMode) {
    this.cameraMode = mode
    this.controls.enabled = mode !== 'chase' || !this.niva?.parent
    this.lastNivaTarget = null
  }

  setNivaLights(lights: NivaLights) {
    this.nivaLights = lights
    if (this.niva) setNivaLights(this.niva, { ...lights, night: this.night, braking: this.nivaBraking })
  }

  /** `state`: the driving state (niva.ts), in metres from the north-west corner and real heights. */
  updateNiva(state: NivaState, dt: number) {
    const model = this.niva
    if (!model?.parent || !state.wheels) return
    const g = this.grid
    const x0 = ((g.cols - 1) * g.cellSize) / 2
    const z0 = ((g.rows - 1) * g.cellSize) / 2
    const ex = this.exaggeration
    const [fl, fr, rl, rr] = state.wheels
    const forward = new THREE.Vector3(Math.sin(state.heading), 0, -Math.cos(state.heading))
    const along = forward.clone().multiplyScalar(NIVA.wheelbase).setY((((fl + fr) - (rl + rr)) / 2) * ex).normalize()
    const left = new THREE.Vector3(-Math.cos(state.heading), 0, -Math.sin(state.heading))
      .multiplyScalar(NIVA.track).setY((((fl + rl) - (fr + rr)) / 2) * ex).normalize()
    const up = new THREE.Vector3().crossVectors(along, left).normalize()
    left.crossVectors(up, along).normalize()
    model.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(left, up, along))
    // In blocks, the Niva drives on the real relief but stands on the
    // highest of the blocks under its wheels: never sunk into a step.
    let base = (state.ground - g.zBase) * ex
    if (this.blockData) {
      const a = NIVA.wheelbase / 2
      const b = NIVA.track / 2
      base = -Infinity
      for (const [f, l] of [[a, b], [a, -b], [-a, b], [-a, -b]]) {
        const x = state.x + Math.sin(state.heading) * f - Math.cos(state.heading) * l
        const z = state.z - Math.cos(state.heading) * f - Math.sin(state.heading) * l
        base = Math.max(base, (this.blockTop(x, z) ?? 0) * ex)
      }
    }
    model.position.set(state.x - x0, base, state.z - z0)

    const { wheels, steering } = nivaParts(model)
    for (const wheel of wheels) wheel.rotation.x = state.wheelSpin
    for (const pivot of steering) pivot.rotation.y = -state.steer
    if (state.braking !== this.nivaBraking) {
      this.nivaBraking = state.braking
      this.setNivaLights(this.nivaLights)
    }

    const target = model.position.clone().add(new THREE.Vector3(0, 1.4, 0))
    if (this.cameraMode === 'chase') {
      const desired = target.clone().addScaledVector(forward, -this.chaseDistance)
      desired.y += this.chaseDistance * 0.38
      // Never under the terrain, even behind a mound.
      const ground = (this.heightAt(desired.x + x0, desired.z + z0) - g.zBase) * ex + 1.5
      if (desired.y < ground) desired.y = ground
      const k = this.lastNivaTarget ? 1 - Math.exp(-dt * 4) : 1
      this.camera.position.lerp(desired, k)
      this.controls.target.lerp(target.clone().addScaledVector(forward, 4), Math.min(1, k * 2))
    } else if (this.lastNivaTarget) {
      const delta = target.clone().sub(this.lastNivaTarget)
      this.camera.position.add(delta)
      this.controls.target.add(delta)
    } else {
      this.controls.target.copy(target)
    }
    this.lastNivaTarget = target
  }

  /** Height (m) under a point of the local frame (x east, z south, origin north-west), nearest vertex. */
  heightAt(x: number, z: number): number {
    const g = this.grid
    const c = Math.min(g.cols - 1, Math.max(0, Math.round(x / g.cellSize)))
    const r = Math.min(g.rows - 1, Math.max(0, Math.round(z / g.cellSize)))
    return g.heights[r * g.cols + c]
  }

  /** The terrain point under a pointer event: { col, row } of the mesh grid, or null. */
  pick(event: { clientX: number; clientY: number }): { col: number; row: number } | null {
    const rect = this.renderer.domElement.getBoundingClientRect()
    const pointer = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    )
    const raycaster = new THREE.Raycaster()
    raycaster.setFromCamera(pointer, this.camera)
    const hit = raycaster.intersectObject(this.terrain, false)[0]
    if (!hit?.uv) return null
    const g = this.grid
    return { col: Math.round(hit.uv.x * (g.cols - 1)), row: Math.round((1 - hit.uv.y) * (g.rows - 1)) }
  }

  private frame() {
    this.onFrame?.()
    this.controls.update()
    this.renderer.render(this.scene, this.camera)
  }

  dispose() {
    this.renderer.setAnimationLoop(null)
    this.resizeObserver.disconnect()
    this.controls.dispose()
    if (this.onWheel) this.renderer.domElement.removeEventListener('wheel', this.onWheel)
    this.blocks?.geometry.dispose()
    this.setBuildings(null)
    this.stars?.geometry.dispose()
    this.terrain.geometry.dispose()
    this.material.map?.dispose()
    this.material.dispose()
    this.particles.geometry.dispose()
    this.overlayTexture.dispose()
    this.waterTexture.dispose()
    this.sunTexture.dispose()
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }
}
