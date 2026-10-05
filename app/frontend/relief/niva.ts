// Ported from Claudy (MIT, © 2022-2023 Fondation Les 4 Sources)
//
// The Niva on the 3D view: a matt green Lada Niva, with a bull bar LED and a
// roof light bar, set down on the terrain and driven with the arrow keys.
// This half is the driving, without three.js: speed, steering, slope, side
// slope and obstacles, read on the REAL relief (metres, no exaggeration).
// The model is in `nivaModel.ts`, loaded with the scene.
//
// Driving frame: x east and z south, in metres from the grid's north-west
// corner; `heading` is the azimuth from north, clockwise.

import { ROLE } from './roles.ts'

/** Lada Niva 2121, three doors. */
export const NIVA = { wheelbase: 2.2, track: 1.43, wheelRadius: 0.343, length: 3.74, width: 1.68 }

const G = 9.81
const ENGINE = 5.4          // m/s², in low range: enough to climb ~55 %
const REVERSE = 2.6
const BRAKE = 7.5
const MAX_GRADE = 0.58      // beyond, the wheels spin: the Niva slides back
const MAX_ROLL = 0.7        // ~35° of side slope: we don't go there
const WARN_ROLL = 0.4
const MAX_STEER = 0.6
const STEER_RATE = 2.4      // rad/s
const REVERSE_MAX = 15 / 3.6

/** What stops or slows the car, as an i18n key under `relief.page.niva.status`. */
export type NivaMessage = 'edge' | 'building' | 'water' | 'too_steep' | 'tipping' | 'side_slope' | 'undergrowth'

export type NivaState = {
  x: number
  z: number
  heading: number
  speed: number
  steer: number
  wheelSpin: number
  braking: boolean
  status: NivaMessage | null
  warning: NivaMessage | null
  pitch: number
  roll: number
  ground: number
  /** Ground height under the four wheels: front left, front right, rear left, rear right. */
  wheels: [number, number, number, number] | null
}

export type NivaInput = { throttle: number; steer: number; brake: boolean }

export type NivaCell = { role: number; above: number; dug: number }

export type NivaTerrain = {
  width: number
  depth: number
  height(x: number, z: number): number
  cell(x: number, z: number): NivaCell | null
}

export function createNivaState(x: number, z: number, heading: number): NivaState {
  return {
    x, z, heading, speed: 0, steer: 0, wheelSpin: 0, braking: false, status: null, warning: null,
    pitch: 0, roll: 0, ground: 0, wheels: null,
  }
}

/** The speed the ground allows under the car: road, meadow, undergrowth. */
function speedLimit(cell: NivaCell | null): number {
  if (!cell) return 40 / 3.6
  if (cell.role === ROLE.road) return 60 / 3.6
  if (cell.role === ROLE.forest && cell.above > 4) return 12 / 3.6
  return 40 / 3.6
}

/** What stops the car: a wall, a pond, the edge of the relief. */
function obstacle(cell: NivaCell | null): NivaMessage | null {
  if (!cell) return 'edge'
  if (cell.role === ROLE.building && cell.above > 1.5) return 'building'
  if (cell.role === ROLE.water || cell.dug > 0.6) return 'water'
  return null
}

function wheelHeights(terrain: NivaTerrain, x: number, z: number, heading: number): [number, number, number, number] {
  const fx = Math.sin(heading)
  const fz = -Math.cos(heading)
  const lx = -Math.cos(heading)
  const lz = -Math.sin(heading)
  const a = NIVA.wheelbase / 2
  const b = NIVA.track / 2
  const at = (f: number, l: number) => terrain.height(x + fx * f + lx * l, z + fz * f + lz * l)
  return [at(a, b), at(a, -b), at(-a, b), at(-a, -b)]
}

function attitude(wheels: [number, number, number, number]) {
  const [fl, fr, rl, rr] = wheels
  return {
    pitch: ((fl + fr) - (rl + rr)) / 2 / NIVA.wheelbase,
    roll: ((fl + rl) - (fr + rr)) / 2 / NIVA.track,
    ground: (fl + fr + rl + rr) / 4,
  }
}

/**
 * One driving step. `input`: throttle (-1 reverses / brakes … 1 forward),
 * steer (-1 left … 1 right), brake (handbrake).
 */
export function stepNiva(state: NivaState, input: NivaInput, terrain: NivaTerrain, dt: number): NivaState {
  dt = Math.min(dt, 0.05)
  state.status = null
  state.warning = null

  // The steering comes back to the centre by itself; less lock at speed.
  const maxSteer = MAX_STEER / (1 + Math.abs(state.speed) / 9)
  const targetSteer = input.steer * maxSteer
  const delta = targetSteer - state.steer
  state.steer += Math.sign(delta) * Math.min(Math.abs(delta), STEER_RATE * dt)

  const wheels = state.wheels ?? wheelHeights(terrain, state.x, state.z, state.heading)
  const { pitch, roll } = attitude(wheels)
  const sinPitch = pitch / Math.hypot(1, pitch)
  const cell = terrain.cell(state.x, state.z)

  let accel = 0
  const moving = Math.abs(state.speed) > 0.05
  state.braking = false
  if (input.brake) {
    accel -= Math.sign(state.speed) * BRAKE
    state.braking = true
  } else if (input.throttle > 0) {
    if (state.speed < -0.2) { accel += BRAKE; state.braking = true } else accel += ENGINE * input.throttle
  } else if (input.throttle < 0) {
    if (state.speed > 0.2) { accel -= BRAKE; state.braking = true } else accel -= REVERSE
  }

  // Too steep in the direction of travel: the wheels spin, the engine no
  // longer pulls and the slope takes over.
  const climbing = (input.throttle > 0 && pitch > MAX_GRADE) || (input.throttle < 0 && pitch < -MAX_GRADE)
  if (climbing) {
    accel = 0
    state.status = 'too_steep'
  }

  // Stopped without throttle, the Niva holds on its handbrake as long as the
  // slope allows; otherwise the slope drags it.
  const parked = input.throttle === 0 && Math.abs(state.speed) < 0.4 && Math.abs(pitch) < MAX_GRADE
  if (parked) {
    state.speed = 0
  } else {
    accel -= G * sinPitch
    if (moving) accel -= Math.sign(state.speed) * (0.5 + 0.035 * state.speed * state.speed)
    const before = state.speed
    state.speed += accel * dt
    // Braking stops, it does not start backwards.
    if (state.braking && Math.sign(before) !== Math.sign(state.speed)) state.speed = 0
  }

  const limit = speedLimit(cell)
  if (state.speed > limit) state.speed -= (state.speed - limit) * Math.min(1, dt * 2)
  if (state.speed < -REVERSE_MAX) state.speed = -REVERSE_MAX

  const heading = state.heading + (state.speed / NIVA.wheelbase) * Math.tan(state.steer) * dt
  const step = state.speed * dt
  const x = state.x + Math.sin(heading) * step
  const z = state.z - Math.cos(heading) * step

  // The bumper in the direction of travel must touch nothing.
  const reach = (Math.sign(step) * NIVA.length) / 2
  const bumper = [x + Math.sin(heading) * reach, z - Math.cos(heading) * reach]
  const outside = bumper[0] < 2 || bumper[1] < 2 || bumper[0] > terrain.width - 2 || bumper[1] > terrain.depth - 2
  const blocked: NivaMessage | null = outside ? 'edge' : obstacle(terrain.cell(bumper[0], bumper[1]))
  const nextWheels = blocked ? null : wheelHeights(terrain, x, z, heading)
  const nextRoll = nextWheels ? attitude(nextWheels).roll : 0
  const tipping = !!nextWheels && Math.abs(nextRoll) > MAX_ROLL && Math.abs(nextRoll) > Math.abs(roll)

  if (step !== 0 && (blocked || tipping)) {
    state.speed = -state.speed * 0.15
    state.status = blocked ?? 'tipping'
  } else {
    state.x = x
    state.z = z
    state.heading = heading
    if (nextWheels) state.wheels = nextWheels
    state.wheelSpin += step / NIVA.wheelRadius
  }

  const now = attitude(state.wheels ?? wheels)
  state.pitch = now.pitch
  state.roll = now.roll
  state.ground = now.ground
  if (!state.status && Math.abs(now.roll) > WARN_ROLL) state.warning = 'side_slope'
  if (!state.status && !state.warning && speedLimit(terrain.cell(state.x, state.z)) < 5 && Math.abs(state.speed) > 1) state.warning = 'undergrowth'
  return state
}
