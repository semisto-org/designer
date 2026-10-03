// Ported from Claudy (MIT, © 2022-2023 Fondation Les 4 Sources)
//
// The 3D scene of the relief: the terrain model as a mesh, draped with the
// ortho or a tint (altitude, station…), with contour lines, flow axes,
// depressions and the map's features as an overlay, the water of the rain
// simulation (a tinted water film + tracers following the current), and the
// sun (shadows at a time or hours of sun over a day, tinted on the terrain,
// with the scene's light where the sun is).
//
// This module is the ONLY one importing three.js, and the page loads it with
// a dynamic `import()`: other pages don't pay its weight.
//
// Frame: x east, z south, y up, in metres, centred on the grid. Terrain,
// water and tracers live in one group whose vertical scale IS the
// exaggeration: changing it recomputes nothing.

import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { waterColor } from './colors.ts'
import type { RainSimulation } from './hydro.ts'
import type { SunPosition } from './sun.ts'

/** Overlay canvas resolution, in pixels per grid cell. */
export const OVERLAY_SCALE = 2
const OVERLAY_MAX_PX = 4096
const PARTICLES = 5000

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

  constructor(container: HTMLElement, grid: SceneGrid) {
    this.container = container
    this.grid = grid
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    container.appendChild(this.renderer.domElement)
    this.renderer.domElement.classList.add('block', 'h-full', 'w-full', 'touch-none')

    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color('#e3e9e4')
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

  setBaseTexture(texture: THREE.Texture) {
    texture.colorSpace = THREE.SRGBColorSpace
    texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy()
    this.material.map = texture
    this.material.needsUpdate = true
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
      this.sunLight.intensity = 1.9
      return
    }
    const horizontal = Math.cos(sun.altitude) * distance
    this.sunLight.position.set(Math.sin(sun.azimuth) * horizontal, Math.sin(sun.altitude) * distance,
                               -Math.cos(sun.azimuth) * horizontal)
    this.sunLight.intensity = 2.2
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
