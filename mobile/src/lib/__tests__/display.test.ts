import { census, DEFAULT_DISPLAY, isShown, parseDisplay, reveal, shownAerialView, toggle, UNKNOWN_STRATA, type Display } from '../display-core'
import type { Planting } from '../types'

const planting: Planting = {
  species: { '1': { id: 1, latinName: 'Juglans regia', commonName: 'Noyer', strata: 'canopy' }, '2': { id: 2, latinName: 'X', commonName: null, strata: null } },
  varieties: {},
  palette: [],
}
const plantedTree = { layer: 'plants', kind: 'plant', status: 'active', species_id: 1, planted_on: '2026-03-01' }
const plannedTree = { layer: 'plants', kind: 'plant', status: 'active', species_id: 1 }
const shed = { layer: 'structures', kind: 'shed', status: 'active' }
const draftPond = { layer: 'water', kind: 'pond', status: 'draft' }
const existingTree = { layer: 'existing', kind: 'existing_tree', status: 'active' }
const plannedHedge = { layer: 'structures', kind: 'hedge', status: 'active', planned: true }

describe('display of the terrain map', () => {
  it('shows only what is on the ground by default', () => {
    expect(isShown(plantedTree, DEFAULT_DISPLAY, planting)).toBe(true)
    expect(isShown(shed, DEFAULT_DISPLAY, planting)).toBe(true)
    expect(isShown(existingTree, DEFAULT_DISPLAY, planting)).toBe(true)
    expect(isShown(plannedTree, DEFAULT_DISPLAY, planting)).toBe(false)
    expect(isShown(draftPond, DEFAULT_DISPLAY, planting)).toBe(false)
    expect(isShown(plannedHedge, DEFAULT_DISPLAY, planting)).toBe(false)
    expect(isShown(plannedHedge, { ...DEFAULT_DISPLAY, projected: true }, planting)).toBe(true)
  })

  it('shows the project on demand, and hides layers and strata', () => {
    const withProject: Display = { ...DEFAULT_DISPLAY, projected: true }
    expect(isShown(plannedTree, withProject, planting)).toBe(true)
    expect(isShown(draftPond, withProject, planting)).toBe(true)
    expect(isShown(shed, { ...withProject, hiddenLayers: ['structures'] }, planting)).toBe(false)
    expect(isShown(plantedTree, { ...withProject, hiddenStrata: ['canopy'] }, planting)).toBe(false)
    expect(isShown({ ...plantedTree, species_id: 2 }, { ...withProject, hiddenStrata: [UNKNOWN_STRATA] }, planting)).toBe(false)
  })

  it('reveals a feature the person just added', () => {
    const hiding: Display = { projected: false, hiddenLayers: ['plants', 'water'], hiddenStrata: ['canopy', 'shrub'] }
    expect(reveal(hiding, plannedTree, planting)).toEqual({ projected: true, hiddenLayers: ['water'], hiddenStrata: ['shrub'] })
    expect(reveal(DEFAULT_DISPLAY, shed, planting)).toBe(DEFAULT_DISPLAY)
  })

  it('counts layers, strata and the project', () => {
    expect(census([plantedTree, plannedTree, shed, draftPond].map((properties) => ({ properties })), planting))
      .toEqual({ layers: { plants: 2, structures: 1, water: 1 }, strata: { canopy: 2 }, projected: 2 })
  })

  it('reads stored settings safely', () => {
    expect(parseDisplay(null)).toEqual(DEFAULT_DISPLAY)
    expect(parseDisplay({ projected: true, hiddenLayers: ['notes', 3], hiddenStrata: 'x' })).toEqual({ projected: true, hiddenLayers: ['notes'], hiddenStrata: [], aerialViewId: null })
    expect(toggle(['a'], 'a')).toEqual([])
    expect(toggle([], 'a')).toEqual(['a'])
  })

  it('keeps the chosen drone view while the map still has it', () => {
    const views = [{ id: 4 }, { id: 7 }]
    expect(parseDisplay({ aerialViewId: 7 }).aerialViewId).toBe(7)
    expect(parseDisplay({ aerialViewId: '7' }).aerialViewId).toBeNull()
    expect(shownAerialView({ ...DEFAULT_DISPLAY, aerialViewId: 7 }, views)).toEqual({ id: 7 })
    expect(shownAerialView({ ...DEFAULT_DISPLAY, aerialViewId: 9 }, views)).toBeNull()
    expect(shownAerialView(DEFAULT_DISPLAY, views)).toBeNull()
    // Showing a hidden feature again keeps the drone view.
    const display: Display = { ...DEFAULT_DISPLAY, hiddenLayers: ['structures'], aerialViewId: 4 }
    expect(reveal(display, shed, planting).aerialViewId).toBe(4)
  })
})

describe('sectors', () => {
  it('never show on the terrain map', () => {
    expect(isShown({ layer: 'notes', kind: 'sector' }, DEFAULT_DISPLAY, undefined)).toBe(false)
  })
})
