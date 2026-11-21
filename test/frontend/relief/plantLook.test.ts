import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { BARK_COLORS, DEFAULT_BARK, FLOWER_COLORS, FOLIAGE_TONES, FRUIT_COLORS, autumnColor, autumnStrength, barkColor, densityOf, flowerColor, foliageColor, fruitColor, lookOf } from '../../../app/frontend/relief/plantLook.ts'
import { SEASON_MONTH, type ScenePlant } from '../../../app/frontend/relief/growth.ts'
import { NATURAL_GREENS, PlantLayer } from '../../../app/frontend/relief/plantModels.ts'

test('a look keeps only the values it knows', () => {
  assert.deepEqual(lookOf({ foliageTone: 'purple', leafTexture: 'chunky', barkColor: 'white', fruitColor: 'teal' }), { foliageTone: 'purple', barkColor: 'white' })
  assert.deepEqual(lookOf(null), {})
  assert.deepEqual(lookOf('green'), {})
})

test("a species' colours, else the generic ones", () => {
  assert.equal(barkColor({ barkColor: 'white' }), BARK_COLORS.white)
  assert.equal(barkColor({}), DEFAULT_BARK)
  assert.equal(flowerColor({ flowerColor: 'yellow' }, 3), FLOWER_COLORS.yellow)
  assert.equal(fruitColor({ fruitColor: 'black' }, true), FRUIT_COLORS.black)
  assert.notEqual(fruitColor({}, true), fruitColor({}, false))
  assert.equal(foliageColor({ foliageTone: 'grey_green' }), FOLIAGE_TONES.grey_green)
  assert.equal(foliageColor(undefined), null)
  assert.equal(autumnColor({}, 7), autumnColor({}, 7))
  assert.ok(autumnStrength({ autumnColor: 'none' }) < autumnStrength({ autumnColor: 'red' }))
  assert.ok(densityOf({ crownDensity: 'light' }).scale < densityOf({ crownDensity: 'dense' }).scale)
})

const tree = (look: ScenePlant['look'], seed = 1): ScenePlant => ({
  x: 0, y: 0, form: 'tree', strata: 'canopy', heightM: 15, spreadM: 10, maturityYears: 20, training: 'free',
  start: -30, plant: 0, patch: null, seed, foliage: 'deciduous', flowering: [5], fruiting: [9], look,
})

/** The meshes of a layer, by shape (a one-plant layer has one instance per mesh). */
const meshes = (layer: PlantLayer) => (layer as unknown as { meshes: Map<string, THREE.InstancedMesh> }).meshes
const colorOf = (layer: PlantLayer, shape: string) => {
  const color = new THREE.Color()
  meshes(layer).get(shape)!.getColorAt(0, color)
  return `#${color.getHexString()}`
}

test('the 3D paints the bark, the foliage tone and the faceting of the species', () => {
  const birch = new PlantLayer([tree({ barkColor: 'white', foliageTone: 'light_green', leafTexture: 'fine' })], Float32Array.of(0))
  assert.ok(meshes(birch).has('crownFine'), [...meshes(birch).keys()].join())
  assert.equal(colorOf(birch, 'trunk'), BARK_COLORS.white)
  const walnut = new PlantLayer([tree({ leafTexture: 'coarse' })], Float32Array.of(0))
  assert.ok(meshes(walnut).has('crownCoarse'))
  assert.equal(colorOf(walnut, 'trunk'), DEFAULT_BARK)

  // Its own green in the natural view; the strata's colour in the strata view.
  birch.setMonth(SEASON_MONTH.summer)
  const natural = new THREE.Color(colorOf(birch, 'crownFine')).getHSL({ h: 0, s: 0, l: 0 })
  const tone = new THREE.Color(FOLIAGE_TONES.light_green).getHSL({ h: 0, s: 0, l: 0 })
  assert.ok(Math.abs(natural.l - tone.l) < 0.06, `${natural.l} vs ${tone.l}`)
  birch.setColors({ ...NATURAL_GREENS, canopy: '#ff0000' })
  assert.ok(new THREE.Color(colorOf(birch, 'crownFine')).r > 0.8)
})

test('flowers and fruits take their colours in their months', () => {
  const layer = new PlantLayer([tree({ flowerColor: 'yellow', fruitColor: 'black' })], Float32Array.of(0))
  layer.setMonth(5.5)
  assert.equal(colorOf(layer, 'dots'), FLOWER_COLORS.yellow)
  layer.setMonth(9.5)
  assert.equal(colorOf(layer, 'dots'), FRUIT_COLORS.black)
})
