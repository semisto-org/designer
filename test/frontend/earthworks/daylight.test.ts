import { test } from 'node:test'
import assert from 'node:assert/strict'
import { activeBaseContour, baseContour, daylightToGeoJSON } from '../../../app/frontend/map/earthworks/daylight.ts'

test('the talus lines of a terrace become map lines, by role; anything malformed is left out', () => {
  const data = daylightToGeoJSON([
    { id: 1, properties: { grading: { daylight: { cut_top: [[[4.9, 50.3], [4.91, 50.3]]], fill_toe: [[[4.9, 50.29], [4.91, 50.29]], [[4.9, 50.2]]] } } } },
    { id: 2, properties: { grading: { cut_m3: 3 } } },
    { id: 3, properties: {} },
    { id: 4, properties: { grading: { daylight: { cut_top: 'nope', fill_toe: [[[4.9, 'x'], [4.91, 50.3]]] } } } },
  ])
  assert.deepEqual(data.features.map((f) => [f.properties.id, f.properties.role]), [[1, 'cut_top'], [1, 'fill_toe']])
})

test('the base contour is cut to the terrace and shows only while the plateau sits at its level', () => {
  const outline = { type: 'Polygon' as const, coordinates: [[[4.9, 50.3], [4.9002, 50.3], [4.9002, 50.3001], [4.9, 50.3001], [4.9, 50.3]]] }
  const contour = { type: 'LineString' as const, coordinates: [[4.89, 50.30005], [4.91, 50.30005]] }
  const base = baseContour(contour, 201.234, outline)
  assert.equal(base.level_m, 201.23)
  assert.equal(base.lines.length, 1)
  assert.ok(base.lines[0][0][0] > 4.8999 && base.lines[0][1][0] < 4.9003, 'a few metres past each end, not across the whole map')
  assert.equal(activeBaseContour({ hinge: 'level', level_m: 201.23, base_contour: base }).length, 1)
  assert.equal(activeBaseContour({ hinge: 'level', level_m: '201,23', base_contour: base }).length, 1)
  assert.equal(activeBaseContour({ hinge: 'level', level_m: 200, base_contour: base }).length, 0, 'the level was changed by hand')
  assert.equal(activeBaseContour({ hinge: 'middle', level_m: 201.23, base_contour: base }).length, 0)
})
