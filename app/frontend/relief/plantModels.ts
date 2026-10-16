// The map's plants as volumes in the 3D view, at their size of a given year
// (growth.ts): a tree is a trunk and a low-poly crown, a bush a crown on the
// ground, a perennial a dome, a ground cover a flat mat, a climber a column.
// One instanced mesh per shape, so a few thousand plants cost a handful of
// draw calls and a year is a matrix update.
//
// Plants live outside the exaggerated group of the terrain: they keep their
// real size and stand on the exaggerated relief, like the Niva. Only
// scene.ts imports this module.

import * as THREE from 'three'
import { sizeAt, type PlantStrata, type ScenePlant } from './growth.ts'

/** Foliage greens per strata, as they look in summer (the 3D is not the legend). */
export const NATURAL_GREENS: Record<PlantStrata, string> = {
  canopy: '#4c6a2c',
  sub_canopy: '#68863a',
  shrub: '#7a9443',
  herbaceous: '#93a752',
  ground_cover: '#6f9a4f',
  vine: '#5b7a37',
  root: '#8ea25a',
  aquatic: '#5b8e6a',
}
const BARK = '#6e5a44'
/** Height of the support a climber is drawn on (m). */
const CLIMBER_SUPPORT = 2.5

type Shape = 'trunk' | 'crown' | 'dome' | 'column'

function shapeGeometry(shape: Shape): THREE.BufferGeometry {
  switch (shape) {
    case 'trunk': return new THREE.CylinderGeometry(0.7, 1, 1, 6).translate(0, 0.5, 0)
    case 'crown': return new THREE.IcosahedronGeometry(1, 1)
    case 'dome': return new THREE.SphereGeometry(1, 9, 4, 0, Math.PI * 2, 0, Math.PI / 2)
    case 'column': return new THREE.CylinderGeometry(0.55, 1, 1, 7).translate(0, 0.5, 0)
  }
}

/** The shapes a plant is made of. */
function shapesOf(plant: ScenePlant): Shape[] {
  switch (plant.form) {
    case 'tree': return ['trunk', 'crown']
    case 'bush': return ['crown']
    case 'climber': return ['column']
    default: return ['dome']
  }
}

const ZERO = new THREE.Matrix4().makeScale(0, 0, 0)

export class PlantLayer {
  group = new THREE.Group()
  plants: ScenePlant[]
  private meshes = new Map<Shape, THREE.InstancedMesh>()
  /** Per mesh: the plant (index in `plants`) behind each instance. */
  private owners = new Map<Shape, Int32Array>()
  /** Per plant: its instance in each of its shapes. */
  private slots: Partial<Record<Shape, number>>[] = []
  private altitudes: Float32Array
  private year = 0
  private frame = { x0: 0, z0: 0, zBase: 0, exaggeration: 1 }

  constructor(plants: ScenePlant[], altitudes: Float32Array) {
    this.plants = plants
    this.altitudes = altitudes
    const counts: Record<Shape, number> = { trunk: 0, crown: 0, dome: 0, column: 0 }
    for (const plant of plants) {
      const slots: Partial<Record<Shape, number>> = {}
      for (const shape of shapesOf(plant)) slots[shape] = counts[shape]++
      this.slots.push(slots)
    }
    for (const shape of Object.keys(counts) as Shape[]) {
      if (!counts[shape]) continue
      const material = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.95, metalness: 0, flatShading: shape !== 'trunk' })
      const mesh = new THREE.InstancedMesh(shapeGeometry(shape), material, counts[shape])
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
      // The bounding sphere changes with every year: never culled.
      mesh.frustumCulled = false
      this.meshes.set(shape, mesh)
      this.owners.set(shape, new Int32Array(counts[shape]))
      this.group.add(mesh)
    }
    plants.forEach((_, index) => {
      for (const [shape, slot] of Object.entries(this.slots[index]) as [Shape, number][]) this.owners.get(shape)![slot] = index
    })
    this.setColors(NATURAL_GREENS)
  }

  /** Foliage colour per strata, each plant a little lighter or darker. */
  setColors(colors: Record<PlantStrata, string>) {
    const color = new THREE.Color()
    const hsl = { h: 0, s: 0, l: 0 }
    this.plants.forEach((plant, index) => {
      for (const [shape, slot] of Object.entries(this.slots[index]) as [Shape, number][]) {
        if (shape === 'trunk') color.set(BARK)
        else {
          color.set(colors[plant.strata] ?? NATURAL_GREENS.shrub).getHSL(hsl)
          const jitter = ((plant.seed % 97) / 97 - 0.5) * 0.08
          color.setHSL(hsl.h + jitter * 0.3, hsl.s, Math.min(0.85, Math.max(0.08, hsl.l + jitter)))
        }
        this.meshes.get(shape)!.setColorAt(slot, color)
      }
    })
    for (const mesh of this.meshes.values()) if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }

  /** Where the scene's frame is: centre of the grid, base altitude and exaggeration. */
  place(frame: { x0: number; z0: number; zBase: number; exaggeration: number }) {
    this.frame = frame
    this.setYear(this.year)
  }

  /** Every plant at its size `year` years after year 0 (fractions grow smoothly). */
  setYear(year: number) {
    this.year = year
    const { x0, z0, zBase, exaggeration } = this.frame
    const matrix = new THREE.Matrix4()
    const position = new THREE.Vector3()
    const scale = new THREE.Vector3()
    const turn = new THREE.Quaternion()
    const up = new THREE.Vector3(0, 1, 0)
    this.plants.forEach((plant, index) => {
      const slots = this.slots[index]
      const size = sizeAt(plant, year - plant.start)
      if (!size) {
        for (const [shape, slot] of Object.entries(slots) as [Shape, number][]) this.meshes.get(shape)!.setMatrixAt(slot, ZERO)
        return
      }
      const { height, spread } = size
      const ground = (this.altitudes[index] - zBase) * exaggeration
      const x = plant.x - x0
      const z = plant.y - z0
      turn.setFromAxisAngle(up, (plant.seed % 360) * (Math.PI / 180))
      const set = (shape: Shape, y: number, sx: number, sy: number) => {
        const slot = slots[shape]
        if (slot == null) return
        matrix.compose(position.set(x, ground + y, z), turn, scale.set(sx, sy, sx))
        this.meshes.get(shape)!.setMatrixAt(slot, matrix)
      }
      switch (plant.form) {
        case 'tree': {
          // A young tree is mostly stem; the crown takes over as it grows.
          const trunk = height * (plant.strata === 'canopy' ? 0.38 : 0.32)
          const crown = (height - trunk) / 2
          const radius = Math.max(0.025, spread * 0.03 + height * 0.006)
          set('trunk', -0.1, radius, trunk + crown * 0.4 + 0.1)
          set('crown', trunk + crown, spread / 2, crown)
          break
        }
        case 'bush':
          set('crown', height * 0.47, spread / 2, height / 2)
          break
        case 'climber':
          // On its support (a post, a pergola, a fence): the catalogue's
          // height is what it reaches up a tree.
          set('column', 0, Math.min(0.6, Math.max(0.08, spread / 3)), Math.min(height, CLIMBER_SUPPORT))
          break
        default:
          set('dome', 0, spread / 2, Math.max(0.03, height))
      }
    })
    for (const mesh of this.meshes.values()) mesh.instanceMatrix.needsUpdate = true
  }

  /** The plant (index in `plants`) a ray hits first, or null. */
  pick(raycaster: THREE.Raycaster): number | null {
    const hit = raycaster.intersectObjects([...this.meshes.values()], false)[0]
    if (!hit || hit.instanceId == null) return null
    for (const [shape, mesh] of this.meshes) if (mesh === hit.object) return this.owners.get(shape)![hit.instanceId] ?? null
    return null
  }

  dispose() {
    for (const mesh of this.meshes.values()) {
      mesh.geometry.dispose()
      ;(mesh.material as THREE.Material).dispose()
      mesh.dispose()
    }
    this.group.clear()
  }
}
