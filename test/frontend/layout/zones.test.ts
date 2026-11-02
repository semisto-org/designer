import { test } from 'node:test'
import assert from 'node:assert/strict'
import { arrange, PRIORITY, zoneOn, type Claim } from '../../../app/frontend/map/layout/zones.ts'

let seq = 0
const claim = (id: string, zone: Claim['zone'], priority = 0, active = true): Claim => ({ id, zone, priority, active, seq: ++seq })
const panel = () => claim('panel', { desktop: 'left', phone: 'sheet' }, PRIORITY.panel)
const inspector = () => claim('inspector', { desktop: 'right', phone: 'sheet' }, PRIORITY.inspector)
const chat = (active = true) => claim('chat', { desktop: 'right', phone: 'sheet' }, PRIORITY.chat, active)

test('a zone for each device', () => {
  assert.equal(zoneOn('top', 'phone'), 'top')
  assert.equal(zoneOn({ desktop: 'left', phone: 'sheet' }, 'desktop'), 'left')
  assert.equal(zoneOn({ desktop: 'left', phone: 'sheet' }, 'phone'), 'sheet')
})

test('desktop: the panel on the left and the element sheet on the right, side by side', () => {
  const { shown, visible } = arrange([panel(), inspector()], 'desktop')
  assert.deepEqual(shown.left, ['panel'])
  assert.deepEqual(shown.right, ['inspector'])
  assert.ok(visible.has('panel') && visible.has('inspector'))
})

test('one card per side: the element sheet outranks the discussion, which waits', () => {
  const { shown, visible } = arrange([chat(), inspector()], 'desktop')
  assert.deepEqual(shown.right, ['inspector'])
  assert.equal(visible.has('chat'), false)
  // Selection closed: the discussion comes back.
  assert.deepEqual(arrange([chat()], 'desktop').shown.right, ['chat'])
})

test('a closed card asks for no room', () => {
  assert.deepEqual(arrange([chat(false)], 'desktop').shown, {})
})

test('the version pill waits while a panel is open', () => {
  const version = claim('version', { desktop: 'left', phone: 'bottom' }, PRIORITY.version)
  assert.deepEqual(arrange([version, panel()], 'desktop').shown.left, ['panel'])
  assert.deepEqual(arrange([version], 'desktop').shown.left, ['version'])
})

test('with both side cards, the right one is short; alone it runs the whole height', () => {
  assert.ok(arrange([panel(), inspector()], 'desktop').short.has('right'))
  assert.equal(arrange([inspector()], 'desktop').short.has('right'), false)
  assert.equal(arrange([panel(), inspector()], 'phone').short.size, 0)
})

test('desktop messages: two at once, an action in progress before the AI, then notices', () => {
  const ai = claim('ai-proposals', 'top', PRIORITY.aiProposals)
  const limit = claim('photo-limit', 'top', PRIORITY.notice)
  const drawing = claim('drawing-hint', 'top', PRIORITY.activeTool)
  const { shown, visible } = arrange([limit, ai, drawing], 'desktop')
  assert.deepEqual(shown.top, ['drawing-hint', 'ai-proposals'])
  assert.equal(visible.has('photo-limit'), false)
})

test('phone messages: one at a time, the guide waits behind the AI drafts', () => {
  const guide = claim('journey', { desktop: 'bottom', phone: 'top' }, PRIORITY.guide)
  const ai = claim('ai-proposals', 'top', PRIORITY.aiProposals)
  assert.deepEqual(arrange([guide, ai], 'phone').shown.top, ['ai-proposals'])
  assert.deepEqual(arrange([guide], 'phone').shown.top, ['journey'])
  // On a desktop the guide sits in the foot of the map instead.
  assert.deepEqual(arrange([guide, ai], 'desktop').shown.bottom, ['journey'])
})

test('phone: one sheet at a time, and a sheet hides the foot of the map', () => {
  const strip = claim('time-strip', 'bottom')
  const legend = claim('legend', 'bottom')
  assert.deepEqual(arrange([strip, legend], 'phone').shown.bottom, ['time-strip', 'legend'])
  const { shown } = arrange([strip, legend, panel(), inspector()], 'phone')
  assert.deepEqual(shown.sheet, ['inspector'])
  assert.deepEqual(shown.bottom, [])
  // The foot stays on a desktop, whatever the sides hold.
  assert.deepEqual(arrange([strip, legend, panel(), inspector()], 'desktop').shown.bottom, ['time-strip', 'legend'])
})

test('equal priorities keep their order of arrival', () => {
  const first = claim('a', 'top', PRIORITY.activeTool)
  const second = claim('b', 'top', PRIORITY.activeTool)
  assert.deepEqual(arrange([second, first], 'phone').shown.top, ['a'])
})

test('a zone the device does not have shows nothing', () => {
  assert.deepEqual(arrange([claim('x', 'sheet')], 'desktop').shown, {})
  assert.deepEqual(arrange([claim('y', 'left')], 'phone').shown, {})
})
