// Moving over the terrain with the keyboard, in the overview (not on foot).
//
// Arrows slide the view over the land as a drone would: up goes forward in
// the direction the camera faces, down backs away, left and right slide
// sideways. With Shift, left and right turn around the point looked at and
// up and down come closer or move away. The speed follows the distance to
// that point, so a step feels the same seen from far above or from close.

export type FlyKey = 'up' | 'down' | 'left' | 'right' | 'turn'

export type FlyKeys = Record<FlyKey, boolean>

type Vec3 = { x: number; y: number; z: number }

/** Ground covered per second, as a share of the distance to the point looked at. */
export const FLY_SPEED = 0.6
/** Turning speed around the point looked at (radians per second). */
export const FLY_TURN = 1.2
/** Coming closer or moving away: the distance is multiplied by e^(±rate·dt). */
export const FLY_ZOOM = 1.1

export function noFlyKeys(): FlyKeys {
  return { up: false, down: false, left: false, right: false, turn: false }
}

export function anyFlyKey(keys: FlyKeys): boolean {
  return keys.up || keys.down || keys.left || keys.right
}

export type FlyLimits = {
  minDistance: number
  maxDistance: number
  /** The point looked at stays within ±halfWidth (x) and ±halfDepth (z). */
  halfWidth: number
  halfDepth: number
}

/**
 * The camera and target after `dt` seconds of the keys held. Both move
 * together on the horizontal plane (the camera's height above the target
 * stays), except when coming closer or turning.
 */
export function flyStep(
  camera: Vec3, target: Vec3, keys: FlyKeys, dt: number, limits: FlyLimits,
): { camera: Vec3; target: Vec3 } {
  const offset = { x: camera.x - target.x, y: camera.y - target.y, z: camera.z - target.z }
  const next = { camera: { ...camera }, target: { ...target } }
  if (!anyFlyKey(keys) || dt <= 0) return next
  const ahead = (keys.up ? 1 : 0) - (keys.down ? 1 : 0)
  const side = (keys.right ? 1 : 0) - (keys.left ? 1 : 0)

  if (keys.turn) {
    // Turn around the target (right turns the view clockwise, as the
    // compass reads it) and come closer or move away.
    const angle = side * FLY_TURN * dt
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)
    let ox = offset.x * cos - offset.z * sin
    let oz = offset.x * sin + offset.z * cos
    let oy = offset.y
    const length = Math.hypot(ox, oy, oz)
    if (ahead && length > 0) {
      const wanted = Math.max(limits.minDistance, Math.min(limits.maxDistance, length * Math.exp(-ahead * FLY_ZOOM * dt)))
      const k = wanted / length
      ox *= k
      oy *= k
      oz *= k
    }
    next.camera = { x: target.x + ox, y: target.y + oy, z: target.z + oz }
    return next
  }

  // Forward is where the camera looks, flattened on the ground.
  let fx = -offset.x
  let fz = -offset.z
  const flat = Math.hypot(fx, fz)
  if (flat < 1e-6) {
    // Looking straight down: forward is north (−z).
    fx = 0
    fz = -1
  } else {
    fx /= flat
    fz /= flat
  }
  // Right of forward, seen from above (y up): (−fz, fx).
  const rx = -fz
  const rz = fx
  const distance = Math.hypot(offset.x, offset.y, offset.z)
  const step = Math.max(limits.minDistance, distance) * FLY_SPEED * dt
  let dx = (fx * ahead + rx * side) * step
  let dz = (fz * ahead + rz * side) * step
  if (ahead && side) {
    dx /= Math.SQRT2
    dz /= Math.SQRT2
  }
  const tx = Math.max(-limits.halfWidth, Math.min(limits.halfWidth, target.x + dx))
  const tz = Math.max(-limits.halfDepth, Math.min(limits.halfDepth, target.z + dz))
  next.target = { x: tx, y: target.y, z: tz }
  next.camera = { x: tx + offset.x, y: camera.y, z: tz + offset.z }
  return next
}
