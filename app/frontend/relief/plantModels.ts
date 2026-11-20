// The map's plants as volumes in the 3D view, at their size of a given year
// (growth.ts): a tree is a trunk and a low-poly crown in its silhouette (a
// ball, a cluster of lobes for a spreading tree, a cone, a weeping skirt, a
// crown on many stems), a bush a crown on the ground, a perennial a dome, a
// ground cover a flat mat, a climber a column.
// One instanced mesh per shape, so a few thousand plants cost a handful of
// draw calls and a year is a matrix update.
//
// Plants live outside the exaggerated group of the terrain: they keep their
// real size and stand on the exaggerated relief, like the Niva. Only
// scene.ts imports this module.

import * as THREE from 'three'
import { graftTrunk, plantShape, sizeAt, trunkRadius, type CrownLook, type PlantStrata, type ScenePlant } from './growth.ts'

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

type Shape = 'trunk' | 'stems' | 'crown' | 'lobed' | 'cone' | 'weep' | 'dome' | 'column'

const LOOK_SHAPE: Record<CrownLook, Shape> = { ball: 'crown', lobed: 'lobed', cone: 'cone', weep: 'weep' }

/** Several geometries as one (positions and normals only, non-indexed). */
function merged(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const flat = parts.map((g) => (g.index ? g.toNonIndexed() : g))
  const count = flat.reduce((n, g) => n + g.attributes.position.count, 0)
  const position = new Float32Array(count * 3)
  const normal = new Float32Array(count * 3)
  let offset = 0
  for (const g of flat) {
    position.set(g.attributes.position.array as Float32Array, offset * 3)
    normal.set(g.attributes.normal.array as Float32Array, offset * 3)
    offset += g.attributes.position.count
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3))
  geometry.setAttribute('normal', new THREE.BufferAttribute(normal, 3))
  return geometry
}

function shapeGeometry(shape: Shape): THREE.BufferGeometry {
  switch (shape) {
    case 'trunk': return new THREE.CylinderGeometry(0.7, 1, 1, 6).translate(0, 0.5, 0)
    // Five leaning stems from one stool, in a unit cylinder (radius 1, height 1).
    case 'stems': return merged([0, 1, 2, 3, 4].map((i) => {
      const a = (i / 5) * Math.PI * 2
      return new THREE.CylinderGeometry(0.05, 0.09, 1, 5).translate(0, 0.5, 0)
        .applyMatrix4(new THREE.Matrix4().makeRotationAxis(new THREE.Vector3(Math.sin(a), 0, -Math.cos(a)), 0.45))
        .translate(Math.cos(a) * 0.15, 0, Math.sin(a) * 0.15)
    }))
    case 'crown': return new THREE.IcosahedronGeometry(1, 1)
    // A spreading crown: a broad lobe and smaller ones around, inside the unit sphere.
    case 'lobed': return merged([
      new THREE.IcosahedronGeometry(0.78, 1).translate(0, 0.05, 0),
      new THREE.IcosahedronGeometry(0.5, 1).translate(-0.48, -0.18, 0.2),
      new THREE.IcosahedronGeometry(0.48, 1).translate(0.5, -0.12, -0.2),
      new THREE.IcosahedronGeometry(0.46, 1).translate(0.08, 0.45, 0.12),
      new THREE.IcosahedronGeometry(0.42, 1).translate(-0.12, -0.35, -0.48),
    ])
    case 'cone': return new THREE.ConeGeometry(1, 2, 8, 2).translate(0, 0, 0)
    // Hanging twigs: a dome open underneath, its skirt falling to the bottom of the crown.
    case 'weep': return new THREE.LatheGeometry([
      [0.97, -1], [1, -0.55], [1, 0.1], [0.93, 0.5], [0.72, 0.82], [0.4, 0.97], [0, 1],
    ].map(([x, y]) => new THREE.Vector2(x, y)), 10)
    case 'dome': return new THREE.SphereGeometry(1, 9, 4, 0, Math.PI * 2, 0, Math.PI / 2)
    case 'column': return new THREE.CylinderGeometry(0.55, 1, 1, 7).translate(0, 0.5, 0)
  }
}

/**
 * The shapes a plant is made of, from its form, how it is kept and its
 * silhouette (none of which change with the years): only those get an
 * instance, so a garden of round trees costs no more than before.
 */
function shapesOf(plant: ScenePlant): Shape[] {
  if (plant.form === 'climber') return ['column']
  if (plant.form !== 'tree' && plant.form !== 'bush') return ['dome']
  const shape = plantShape(plant.form, plant.strata, 10, 6, plant.training, graftTrunk(plant), plant.crownForm ?? null)
  if (shape.kind !== 'crown') return [shape.kind === 'column' ? 'column' : 'dome']
  const shapes: Shape[] = []
  if (shape.trunk > 0) shapes.push('trunk')
  if (shape.stems) shapes.push('stems')
  shapes.push(LOOK_SHAPE[shape.look])
  return shapes
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
    const counts: Record<Shape, number> = { trunk: 0, stems: 0, crown: 0, lobed: 0, cone: 0, weep: 0, dome: 0, column: 0 }
    for (const plant of plants) {
      const slots: Partial<Record<Shape, number>> = {}
      for (const shape of shapesOf(plant)) slots[shape] = counts[shape]++
      this.slots.push(slots)
    }
    for (const shape of Object.keys(counts) as Shape[]) {
      if (!counts[shape]) continue
      const material = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.95, metalness: 0, flatShading: shape !== 'trunk' && shape !== 'stems', side: shape === 'weep' ? THREE.DoubleSide : THREE.FrontSide })
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
        if (shape === 'trunk' || shape === 'stems') color.set(BARK)
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
      const shape = plantShape(plant.form, plant.strata, height, spread, plant.training, graftTrunk(plant), plant.crownForm ?? null)
      // Every shape of the plant hidden, then the ones of its silhouette set.
      for (const [name, slot] of Object.entries(slots) as [Shape, number][]) this.meshes.get(name)!.setMatrixAt(slot, ZERO)
      switch (shape.kind) {
        case 'crown': {
          if (shape.trunk > 0) set('trunk', -0.1, trunkRadius(plant, size, year - plant.start), shape.trunk + shape.half * 0.4 + 0.1)
          if (shape.stems) set('stems', -0.05, Math.max(0.3, shape.radius * 0.6), shape.centre)
          const look = LOOK_SHAPE[shape.look]
          // The cone's unit geometry is 2 tall, centred: scaled to the crown's height.
          set(look, shape.centre, shape.radius, shape.half)
          break
        }
        case 'column':
          set('column', 0, shape.radius, shape.height)
          break
        default:
          set('dome', 0, shape.radius, shape.height)
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
