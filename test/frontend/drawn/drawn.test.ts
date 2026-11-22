import { test } from 'node:test'
import assert from 'node:assert/strict'
import { clampPhoto, drawnViewOn, paperBefore, paperOpacity, parseChoice, PHOTO_DEFAULT, PHOTO_MAX } from '../../../app/frontend/map/drawn/rules.ts'
import { contourInterval, gridContours, isMaster } from '../../../app/frontend/map/drawn/contours.ts'

test('the drawn view shows while designing the project, not while presenting it', () => {
  assert.equal(drawnViewOn('project', true, false), true)
  assert.equal(drawnViewOn('existing', true, false), false)
  assert.equal(drawnViewOn('project', false, false), false)
  assert.equal(drawnViewOn('project', true, true), false)
})

test('the photo share stays between none and the most the paper lets through', () => {
  assert.equal(clampPhoto(undefined), PHOTO_DEFAULT)
  assert.equal(clampPhoto(-1), 0)
  assert.equal(clampPhoto(2), PHOTO_MAX)
  assert.equal(clampPhoto(Number.NaN), PHOTO_DEFAULT)
  assert.equal(paperOpacity(0), 1)
  assert.equal(paperOpacity(0.25), 0.75)
  assert.equal(paperOpacity(5), 1 - PHOTO_MAX)
})

test('a viewer starts on paper, and keeps their choice', () => {
  assert.deepEqual(parseChoice(null), { enabled: true, photo: PHOTO_DEFAULT })
  assert.deepEqual(parseChoice({ enabled: false, photo: 0.4 }), { enabled: false, photo: 0.4 })
  assert.deepEqual(parseChoice('nonsense'), { enabled: true, photo: PHOTO_DEFAULT })
})

test('the paper goes under the sketches and the plan, over the photo and the overlays', () => {
  const sources: Record<string, string> = { 'base': 'ortho', 'region-soil': 'soil', 'plan-image-3': 'plan-image-3', 'boundary-fill': 'boundary', 'features-fill': 'features' }
  const order = ['base', 'region-soil', 'drawn-paper', 'plan-image-3', 'boundary-fill', 'features-fill']
  assert.equal(paperBefore(order, (id) => sources[id] ?? '', 'drawn-paper'), 'plan-image-3')
  assert.equal(paperBefore(['base', 'boundary-fill'], (id) => sources[id] ?? '', 'drawn-paper'), 'boundary-fill')
  assert.equal(paperBefore(['base'], (id) => sources[id] ?? '', 'drawn-paper'), undefined)
})

test('the contour interval follows the height of the land', () => {
  assert.equal(contourInterval(3), 0.25)
  assert.equal(contourInterval(12), 1)
  assert.equal(contourInterval(40), 2)
  assert.equal(contourInterval(100), 5)
  assert.equal(isMaster(255, 1), true)
  assert.equal(isMaster(254, 1), false)
  assert.equal(isMaster(10, 2), true)
})

test('a slope gives straight, evenly spaced contour lines across the grid', () => {
  // 20 × 10 cells rising 1 m per column, west to east.
  const cols = 20
  const rows = 10
  const heights = Float32Array.from({ length: cols * rows }, (_, i) => 100 + (i % cols))
  const lines = gridContours(heights, cols, rows, 5)
  assert.deepEqual(lines.map((l) => l.level), [105, 110, 115])
  const at105 = lines.find((l) => l.level === 105)!
  assert.equal(at105.closed, false)
  assert.equal(at105.points.length, rows)
  for (const [c] of at105.points) assert.ok(Math.abs(c - 5) < 1e-6)
})

test('a hill gives closed rings, and holes in the data break no line', () => {
  const cols = 21
  const rows = 21
  const heights = Float32Array.from({ length: cols * rows }, (_, i) => {
    const c = i % cols
    const r = Math.floor(i / cols)
    return 10 - Math.hypot(c - 10, r - 10) / 2
  })
  const rings = gridContours(heights, cols, rows, 1).filter((l) => l.level === 8)
  assert.equal(rings.length, 1)
  assert.equal(rings[0].closed, true)
  assert.deepEqual(rings[0].points[0], rings[0].points.at(-1))
  heights[0] = Number.NaN
  assert.ok(gridContours(heights, cols, rows, 1).length > 0)
})

test('a large relief is thinned before tracing, a small one kept whole', async () => {
  const { thinGrid } = await import('../../../app/frontend/map/drawn/contours.ts')
  const small = thinGrid([1, 2, 3, 4], 2, 2, 10)
  assert.equal(small.step, 1)
  const big = thinGrid(Float32Array.from({ length: 40 * 20 }, (_, i) => i % 40), 40, 20, 10)
  assert.equal(big.step, 4)
  assert.equal(big.cols, 10)
  assert.equal(big.rows, 5)
  assert.equal(big.heights[0], 1.5)
})

test('the margin keeps what the place says, a few lines of each', async () => {
  const { marginNotes, seasonOf } = await import('../../../app/frontend/map/drawn/margin.ts')
  assert.equal(seasonOf(new Date('2026-12-05T12:00:00Z')), 'winter')
  assert.equal(seasonOf(new Date('2026-02-28T12:00:00Z')), 'winter')
  assert.equal(seasonOf(new Date('2026-03-01T12:00:00Z')), 'spring')
  assert.equal(seasonOf(new Date('2026-09-01T12:00:00Z')), 'autumn')
  const notes = marginNotes({
    placeChallenges: ['Gel tardif en bas de pente', ' ', 'Sol compacté', 'Vent du sud-ouest', 'Voisins proches'],
    functions: [{ name: 'Nourrir la famille', status: 'covered' }, { name: 'Accueillir des stages', status: 'missing' }],
    sectorCount: 2,
    observedAt: ['2026-01-10T08:00:00Z', '2026-04-02T08:00:00Z', '2024-07-01T08:00:00Z', 'nonsense'],
    now: new Date('2026-11-21T20:00:00Z'),
  })
  assert.deepEqual(notes.challenges, ['Gel tardif en bas de pente', 'Sol compacté', 'Vent du sud-ouest'])
  assert.deepEqual(notes.unserved, ['Accueillir des stages'])
  assert.deepEqual(notes.missingSeasons, ['summer', 'autumn'])
  assert.equal(notes.count, 3 + 1 + 1 + 1)
})
