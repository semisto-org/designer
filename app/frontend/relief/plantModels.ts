// The map's plants as volumes in the 3D view, at their size of a given year
// (growth.ts): a tree is a trunk and a low-poly crown in its silhouette (a
// ball, a cluster of lobes for a spreading tree, a cone, a weeping skirt, a
// crown on many stems), a bush a crown on the ground, a perennial a dome, a
// ground cover a flat mat, a climber a column.
// One instanced mesh per shape, so a few thousand plants cost a handful of
// draw calls and a year is a matrix update.
//
// The month shown (setMonth) dresses them for the season: a deciduous tree
// opens its leaves in April, turns in October and stands bare in winter on
// its branches; perennials die back to a tuft; flowers and fruits are dots
// on the crown in their months (from the plant's sheet).
//
// Each species wears its own look (plantLook.ts): the tone of its foliage,
// its bark, the colour of its flowers, fruits and autumn leaves, a crown a
// little airier or fuller, and facets that say how big its leaves are
// (chunky for a walnut, finer for a birch). The shapes stay shared, so a
// species costs a colour, not a mesh.
//
// Plants live outside the exaggerated group of the terrain: they keep their
// real size and stand on the exaggerated relief, like the Niva. Only
// scene.ts imports this module.

import * as THREE from 'three'
import { foliageOf, graftTrunk, plantShape, seasonLook, sizeAt, sizeJitter, todaysSeasonMonth, trunkRadius, type CrownLook, type PlantStrata, type ScenePlant } from './growth.ts'
import { autumnColor, autumnStrength, barkColor, densityOf, flowerColor, foliageColor, fruitColor, type LeafTexture } from './plantLook.ts'

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
/** Bare twigs in winter, a perennial's dry tuft. */
const TWIGS = '#7d6c5c'
const STRAW = '#a8976a'

type Shape = 'trunk' | 'stems' | 'branches' | 'crown' | 'crownFine' | 'crownCoarse' | 'lobed' | 'lobedFine' | 'lobedCoarse'
  | 'cone' | 'weep' | 'dome' | 'column' | 'dots'
const SHAPES: Shape[] = ['trunk', 'stems', 'branches', 'crown', 'crownFine', 'crownCoarse', 'lobed', 'lobedFine', 'lobedCoarse', 'cone', 'weep', 'dome', 'column', 'dots']

/**
 * The leafy shape of a crown: its silhouette, faceted after its leaves
 * (big chunky facets for big leaves, small ones for fine leaves).
 */
function leafShape(look: CrownLook, texture: LeafTexture | undefined): Shape {
  if (look === 'cone' || look === 'weep') return look
  const base = look === 'lobed' ? 'lobed' : 'crown'
  return texture === 'fine' ? `${base}Fine` : texture === 'coarse' ? `${base}Coarse` : base
}

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

/** A cylinder of radius `r` from `a` to `b`. */
function limb(a: THREE.Vector3, b: THREE.Vector3, r: number): THREE.BufferGeometry {
  const length = a.distanceTo(b)
  const geometry = new THREE.CylinderGeometry(r * 0.6, r, length, 4).translate(0, length / 2, 0)
  const turn = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize())
  return geometry.applyQuaternion(turn).translate(a.x, a.y, a.z)
}

/** Points spread over the unit sphere, from the top down to `lowest` (y). */
function spherePoints(count: number, lowest: number): THREE.Vector3[] {
  const points: THREE.Vector3[] = []
  const golden = Math.PI * (3 - Math.sqrt(5))
  for (let i = 0; i < count; i++) {
    const y = 1 - ((i + 0.5) / count) * (1 - lowest)
    const r = Math.sqrt(1 - y * y)
    points.push(new THREE.Vector3(Math.cos(i * golden) * r, y, Math.sin(i * golden) * r))
  }
  return points
}

function lobed(detail: number): THREE.BufferGeometry {
  return merged([
    new THREE.IcosahedronGeometry(0.78, detail).translate(0, 0.05, 0),
    new THREE.IcosahedronGeometry(0.5, detail).translate(-0.48, -0.18, 0.2),
    new THREE.IcosahedronGeometry(0.48, detail).translate(0.5, -0.12, -0.2),
    new THREE.IcosahedronGeometry(0.46, detail).translate(0.08, 0.45, 0.12),
    new THREE.IcosahedronGeometry(0.42, detail).translate(-0.12, -0.35, -0.48),
  ])
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
    // A leader and six limbs inside the unit sphere: what a deciduous crown shows in winter.
    case 'branches': {
      const base = new THREE.Vector3(0, -1, 0)
      const parts = [limb(base, new THREE.Vector3(0, 0.85, 0), 0.05)]
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + 0.4
        const from = new THREE.Vector3(0, -0.55 + (i % 3) * 0.3, 0)
        parts.push(limb(from, new THREE.Vector3(Math.cos(a) * 0.8, from.y + 0.55, Math.sin(a) * 0.8), 0.035))
      }
      return merged(parts)
    }
    // Flowers or fruits: small balls on the surface of the unit sphere.
    case 'dots': return merged(spherePoints(18, -0.5).map((p) => new THREE.IcosahedronGeometry(0.1, 0).translate(p.x, p.y, p.z)))
    case 'crown': return new THREE.IcosahedronGeometry(1, 1)
    case 'crownFine': return new THREE.IcosahedronGeometry(1, 2)
    case 'crownCoarse': return new THREE.IcosahedronGeometry(1, 0)
    // A spreading crown: a broad lobe and smaller ones around, inside the unit sphere.
    case 'lobed': return lobed(1)
    case 'lobedFine': return lobed(2)
    case 'lobedCoarse': return lobed(0)
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
  const showy = !!(plant.flowering?.length || plant.fruiting?.length)
  if (plant.form === 'climber') return ['column']
  if (plant.form !== 'tree' && plant.form !== 'bush') return showy ? ['dome', 'dots'] : ['dome']
  const shape = plantShape(plant.form, plant.strata, 10, 6, plant.training, graftTrunk(plant), plant.crownForm ?? null)
  if (shape.kind !== 'crown') return [shape.kind === 'column' ? 'column' : 'dome']
  const shapes: Shape[] = []
  if (shape.trunk > 0) shapes.push('trunk')
  if (shape.stems) shapes.push('stems')
  if (foliageOf(plant) !== 'evergreen') shapes.push('branches')
  shapes.push(leafShape(shape.look, plant.look?.leafTexture))
  if (showy && shape.look !== 'cone') shapes.push('dots')
  return shapes
}

/** `a` blended toward `b` by `t` (0–1), in place. */
function blend(a: THREE.Color, b: string, t: number): THREE.Color {
  return t <= 0 ? a : a.lerp(new THREE.Color(b), Math.min(1, t))
}

const ZERO = new THREE.Matrix4().makeScale(0, 0, 0)
/** How much of a ghost plant shows: enough to read its size, not enough to take it for planted. */
const GHOST_OPACITY = 0.55

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
  /** The month shown, 1 (1 January) to 13 (31 December): today's by default. */
  private month = todaysSeasonMonth()
  private colors: Record<PlantStrata, string> = NATURAL_GREENS
  private frame = { x0: 0, z0: 0, zBase: 0, exaggeration: 1 }

  /**
   * `ghost`: drawn see-through, for a plant that is not on the map yet (an
   * AI's draft, or the one being placed or moved in 3D).
   */
  constructor(plants: ScenePlant[], altitudes: Float32Array, { ghost = false }: { ghost?: boolean } = {}) {
    this.plants = plants
    this.altitudes = altitudes
    const counts = Object.fromEntries(SHAPES.map((shape) => [shape, 0])) as Record<Shape, number>
    for (const plant of plants) {
      const slots: Partial<Record<Shape, number>> = {}
      for (const shape of shapesOf(plant)) slots[shape] = counts[shape]++
      this.slots.push(slots)
    }
    for (const shape of Object.keys(counts) as Shape[]) {
      if (!counts[shape]) continue
      const material = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.95, metalness: 0, flatShading: shape !== 'trunk' && shape !== 'stems' && shape !== 'branches', side: shape === 'weep' ? THREE.DoubleSide : THREE.FrontSide })
      if (ghost) {
        material.transparent = true
        material.opacity = GHOST_OPACITY
        material.depthWrite = false
      }
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

  /**
   * Foliage colour: in the natural view the species' own tone (else its
   * strata's green), in the strata view the strata's colour; each plant a
   * little lighter or darker and a touch warmer or cooler, then dressed for
   * the month shown with its bark, flowers, fruits and autumn colour.
   */
  setColors(colors: Record<PlantStrata, string>) {
    this.colors = colors
    const natural = colors === NATURAL_GREENS
    const color = new THREE.Color()
    const hsl = { h: 0, s: 0, l: 0 }
    this.plants.forEach((plant, index) => {
      const season = seasonLook(plant, this.month)
      const look = plant.look
      for (const [shape, slot] of Object.entries(this.slots[index]) as [Shape, number][]) {
        if (shape === 'trunk' || shape === 'stems') color.set(barkColor(look))
        // Twigs take a little of their bark (a birch stands pale in winter).
        else if (shape === 'branches') blend(color.set(TWIGS), barkColor(look), 0.45)
        else if (shape === 'dots') color.set(season.blossom ? flowerColor(look, plant.seed) : fruitColor(look, plant.form === 'tree'))
        else {
          color.set((natural && foliageColor(look)) || colors[plant.strata] || NATURAL_GREENS.shrub).getHSL(hsl)
          const jitter = ((plant.seed % 97) / 97 - 0.5) * 0.08
          const warmth = ((plant.seed % 89) / 89 - 0.5) * 0.04
          const lighter = natural ? densityOf(look).lightness : 0
          color.setHSL(hsl.h + jitter * 0.3 + warmth, Math.min(1, Math.max(0, hsl.s + warmth)), Math.min(0.85, Math.max(0.08, hsl.l + jitter + lighter)))
          blend(color, autumnColor(look, plant.seed), season.autumn * autumnStrength(look))
          if (shape === 'dome' || shape === 'column') blend(color, shape === 'dome' ? STRAW : TWIGS, 1 - season.leaf)
        }
        this.meshes.get(shape)!.setColorAt(slot, color)
      }
    })
    for (const mesh of this.meshes.values()) if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }

  /** Every plant as it looks in `month` (1 = 1 January … 13 = 31 December). */
  setMonth(month: number) {
    this.month = month
    this.setColors(this.colors)
    this.setYear(this.year)
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
      const grown = sizeAt(plant, year - plant.start)
      if (!grown) {
        for (const [shape, slot] of Object.entries(slots) as [Shape, number][]) this.meshes.get(shape)!.setMatrixAt(slot, ZERO)
        return
      }
      const jitter = sizeJitter(plant)
      const size = { height: grown.height * jitter, spread: grown.spread * jitter }
      const { height, spread } = size
      const season = seasonLook(plant, this.month)
      // Leaves: the crown shrinks as they fall, and goes when the tree is bare.
      const leaves = season.leaf < 0.04 ? 0 : 0.45 + 0.55 * season.leaf
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
          set('branches', shape.centre, shape.radius, shape.half)
          const look = leafShape(shape.look, plant.look?.leafTexture)
          // An airy crown is a little narrower, a dense one a little fuller.
          const density = densityOf(plant.look).scale
          // The cone's unit geometry is 2 tall, centred: scaled to the crown's height.
          if (leaves > 0) set(look, shape.centre, shape.radius * leaves * density, shape.half * leaves)
          if (season.blossom || season.fruit) set('dots', shape.centre, shape.radius * 1.02, shape.half * 1.02)
          break
        }
        case 'column':
          set('column', 0, shape.radius, shape.height)
          break
        default: {
          // A perennial dies back to a low tuft in winter.
          const tuft = 0.25 + 0.75 * season.leaf
          set('dome', 0, shape.radius * (0.6 + 0.4 * season.leaf), shape.height * tuft)
          if ((season.blossom || season.fruit) && season.leaf > 0.3) set('dots', 0, shape.radius * 1.02, shape.height * tuft * 1.05)
        }
      }
    })
    for (const mesh of this.meshes.values()) mesh.instanceMatrix.needsUpdate = true
  }

  /** Moves plant `index` (grid metres, ground altitude in metres), as the pointer carries it. */
  moveTo(index: number, x: number, y: number, altitude: number) {
    const plant = this.plants[index]
    if (!plant) return
    plant.x = x
    plant.y = y
    this.altitudes[index] = altitude
    this.setYear(this.year)
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
