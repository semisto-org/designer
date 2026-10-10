import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isWebGLError } from '../../../app/frontend/map/webgl.ts'

test('recognises MapLibre GPU initialisation errors', () => {
  const error = new Error('WebGL2 is required to display this map.')
  error.name = 'GPUInitializationError'
  assert.equal(isWebGLError(error), true)
})

test('recognises older WebGL context failures by their message', () => {
  assert.equal(isWebGLError(new Error('Failed to initialize WebGL')), true)
})

test('leaves other errors alone', () => {
  assert.equal(isWebGLError(new TypeError('container not found')), false)
  assert.equal(isWebGLError('WebGL'), false)
  assert.equal(isWebGLError(undefined), false)
})
