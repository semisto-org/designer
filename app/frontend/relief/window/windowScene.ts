// « Fenêtre sur l'an 15 »: the design's plants, grown to a year, painted
// over what the phone's camera (or a photo taken on the land) shows.
//
// A lean scene of its own, beside relief/scene.ts: no sky, no overlay, no
// water. The ground is drawn into the depth buffer only, so a hill or a
// bank hides the trees behind it while the real landscape shows through;
// the surface model (buildings, hedges, woods as the LiDAR saw them) does
// the same when the region has one. « Recaler » shows that ground as a
// faint sheet with its contour lines, to lay it on the real horizon.

import * as THREE from 'three'
import { PlantLayer } from '../plantModels.ts'
import type { ScenePlant } from '../growth.ts'
import { RenderLoop } from '../renderLoop.ts'
import type { SunPosition } from '../sun.ts'
import type { Pose } from './pose.ts'

/** The eye of someone standing, above the ground. */
export const EYE_HEIGHT = 1.6

export type WindowGround = {
  /** Heights (m) of the occluding ground, row by row from the north-west, `cellSize` metres apart. */
  heights: Float32Array
  cols: number
  rows: number
  cellSize: number
}

export type WindowFrame = {
  /** Centre of the full grid, in grid metres (x east, z south from the north-west node). */
  x0: number
  z0: number
  /** Altitude of the scene's floor. */
  zBase: number
}

const GUIDE_COLOR = '#f4ead6'
const CONTOUR_COLOR = '#7a5c3e'

export class WindowScene {
  readonly loop: RenderLoop
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera = new THREE.PerspectiveCamera(60, 1, 0.3, 4000)
  private plants: PlantLayer | null = null
  private ground: THREE.Mesh
  private groundDepth: THREE.Material
  private groundGuide: THREE.Material
  private sunLight = new THREE.DirectionalLight('#fffaf0', 2.1)
  private container: HTMLElement
  private resizeObserver: ResizeObserver
  private frame: WindowFrame

  constructor(container: HTMLElement, ground: WindowGround, frame: WindowFrame) {
    this.container = container
    this.frame = frame
    // Transparent: the camera's video or the photo shows through. Kept
    // buffer: « Garder cette vue » reads the image back.
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.setClearColor(0x000000, 0)
    container.appendChild(this.renderer.domElement)
    this.renderer.domElement.classList.add('block', 'h-full', 'w-full', 'touch-none')

    this.scene.add(new THREE.HemisphereLight('#f4f7fb', '#5b5140', 1.15))
    this.scene.add(this.sunLight)
    this.sunLight.position.set(-300, 400, -300)

    this.groundDepth = new THREE.MeshBasicMaterial({ colorWrite: false })
    this.groundGuide = guideMaterial()
    this.ground = new THREE.Mesh(groundGeometry(ground, frame), this.groundDepth)
    // Drawn first: its depth hides what stands behind a bank.
    this.ground.renderOrder = -1
    this.scene.add(this.ground)

    this.loop = new RenderLoop(() => {
      this.renderer.render(this.scene, this.camera)
      return false
    })
    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(container)
    this.resize()
  }

  /** The plants (grid metres) and the real altitude of the ground under each. */
  setPlants(plants: ScenePlant[], altitudes: Float32Array, year: number, month: number) {
    if (this.plants) {
      this.scene.remove(this.plants.group)
      this.plants.dispose()
      this.plants = null
    }
    if (plants.length) {
      this.plants = new PlantLayer(plants, altitudes)
      this.plants.place({ x0: this.frame.x0, z0: this.frame.z0, zBase: this.frame.zBase, exaggeration: 1 })
      this.plants.setMonth(month)
      this.plants.setYear(year)
      this.scene.add(this.plants.group)
    }
    this.loop.invalidate()
  }

  setYear(year: number) {
    this.plants?.setYear(year)
    this.loop.invalidate()
  }

  setMonth(month: number) {
    this.plants?.setMonth(month)
    this.loop.invalidate()
  }

  /** Light from where the sun is (or a soft north-west light at night). */
  setSun(sun: SunPosition | null) {
    if (!sun || sun.altitude <= 0.05) this.sunLight.position.set(-300, 400, -300)
    else {
      const horizontal = Math.cos(sun.altitude) * 500
      this.sunLight.position.set(Math.sin(sun.azimuth) * horizontal, Math.sin(sun.altitude) * 500, -Math.cos(sun.azimuth) * horizontal)
    }
    this.loop.invalidate()
  }

  /** Show the ground as a faint sheet with its contours, to lay it on the real landscape. */
  setGuide(on: boolean) {
    this.ground.material = on ? this.groundGuide : this.groundDepth
    this.loop.invalidate()
  }

  /**
   * Where the eye is (grid metres, x east and z south from the north-west
   * node; `altitude` in metres) and where it looks; `fov` is the vertical
   * field of view in degrees.
   */
  setView(x: number, z: number, altitude: number, pose: Pose, fov: number) {
    const { x0, z0, zBase } = this.frame
    const position = new THREE.Vector3(x - x0, altitude - zBase, z - z0)
    this.camera.position.copy(position)
    this.camera.up.set(...pose.up)
    this.camera.lookAt(position.clone().add(new THREE.Vector3(...pose.forward)))
    // `project` reads the camera before the next image is drawn.
    this.camera.updateMatrixWorld()
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov = fov
      this.camera.updateProjectionMatrix()
    }
    this.loop.invalidate()
  }

  /** Where a point of the scene (grid metres, altitude) falls on the canvas, in CSS pixels; null behind the eye. */
  project(x: number, z: number, altitude: number): { left: number; top: number; distance: number } | null {
    const { x0, z0, zBase } = this.frame
    const point = new THREE.Vector3(x - x0, altitude - zBase, z - z0)
    const distance = point.distanceTo(this.camera.position)
    point.project(this.camera)
    if (point.z > 1 || point.z < -1) return null
    const { clientWidth, clientHeight } = this.renderer.domElement
    return { left: ((point.x + 1) / 2) * clientWidth, top: ((1 - point.y) / 2) * clientHeight, distance }
  }

  /** The canvas's size in CSS pixels. */
  get width(): number { return this.renderer.domElement.clientWidth }
  get height(): number { return this.renderer.domElement.clientHeight }

  /** The plants as drawn now, for « Garder cette vue » (drawn at once, so the buffer holds them). */
  snapshot(): HTMLCanvasElement {
    this.renderer.render(this.scene, this.camera)
    return this.renderer.domElement
  }

  private resize() {
    const { clientWidth, clientHeight } = this.container
    if (!clientWidth || !clientHeight) return
    this.renderer.setSize(clientWidth, clientHeight, false)
    this.camera.aspect = clientWidth / clientHeight
    this.camera.updateProjectionMatrix()
    this.loop.invalidate()
  }

  dispose() {
    this.loop.stop()
    this.resizeObserver.disconnect()
    this.plants?.dispose()
    this.ground.geometry.dispose()
    this.groundDepth.dispose()
    this.groundGuide.dispose()
    this.renderer.dispose()
    this.renderer.forceContextLoss()
    this.renderer.domElement.remove()
  }
}

function groundGeometry(ground: WindowGround, frame: WindowFrame): THREE.BufferGeometry {
  const { heights, cols, rows, cellSize } = ground
  const positions = new Float32Array(cols * rows * 3)
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c
      positions[i * 3] = c * cellSize - frame.x0
      positions[i * 3 + 1] = heights[i] - frame.zBase
      positions[i * 3 + 2] = r * cellSize - frame.z0
    }
  }
  const index = new Uint32Array((cols - 1) * (rows - 1) * 6)
  let k = 0
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const a = r * cols + c
      const b = a + 1
      const d = a + cols
      const e = d + 1
      index[k++] = a; index[k++] = d; index[k++] = b
      index[k++] = b; index[k++] = d; index[k++] = e
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setIndex(new THREE.BufferAttribute(index, 1))
  geometry.computeVertexNormals()
  return geometry
}

/** A paper-coloured veil with a contour line every metre, a stronger one every five. */
function guideMaterial(): THREE.Material {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: true,
    uniforms: { paper: { value: new THREE.Color(GUIDE_COLOR) }, ink: { value: new THREE.Color(CONTOUR_COLOR) } },
    vertexShader: `
      varying float vHeight;
      varying vec3 vNormal;
      void main() {
        vHeight = position.y;
        vNormal = normal;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 paper;
      uniform vec3 ink;
      varying float vHeight;
      varying vec3 vNormal;
      float line(float value, float width) {
        float f = abs(fract(value + 0.5) - 0.5) / fwidth(value);
        return 1.0 - min(f / width, 1.0);
      }
      void main() {
        float minor = line(vHeight, 1.4) * 0.7;
        float major = line(vHeight / 5.0, 2.2);
        float shade = 0.82 + 0.18 * clamp(dot(normalize(vNormal), normalize(vec3(-0.5, 0.8, -0.4))), 0.0, 1.0);
        float lines = max(minor, major);
        gl_FragColor = vec4(mix(paper * shade, ink, lines), 0.34 + 0.6 * lines);
      }`,
  })
}
