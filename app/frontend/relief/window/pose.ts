// « Fenêtre sur l'an 15 »: where the phone stands and looks, from its
// sensors, and how wide its camera sees. Pure geometry, no import: the
// tests run it alone.
//
// Two frames meet here:
// - the Earth frame of the W3C DeviceOrientation spec: x east, y north, z up;
// - the 3D scene's frame (relief/scene.ts): x east, y up, z SOUTH.

export type Vec3 = [number, number, number]

/** Where the camera looks and which way is the top of the picture, in the scene's frame. */
export type Pose = { forward: Vec3; up: Vec3 }

const RAD = Math.PI / 180

/**
 * The phone's back camera from a deviceorientation event (degrees): alpha
 * around z, beta around x, gamma around y, R = Rz(alpha)·Rx(beta)·Ry(gamma),
 * device frame to Earth frame. The back camera looks along −z of the device;
 * the top of the picture is the device's +y in portrait, turned by the
 * screen's angle (90: the phone on its left side, its right edge up).
 * `alpha` must be absolute (0 = the device's top towards north when flat).
 */
export function deviceCameraPose(alpha: number, beta: number, gamma: number, screenAngle = 0): Pose {
  const a = alpha * RAD
  const b = beta * RAD
  const g = gamma * RAD
  const ca = Math.cos(a); const sa = Math.sin(a)
  const cb = Math.cos(b); const sb = Math.sin(b)
  const cg = Math.cos(g); const sg = Math.sin(g)
  // Columns of R = Rz·Rx·Ry.
  const r00 = ca * cg - sa * sb * sg; const r01 = -cb * sa; const r02 = ca * sg + cg * sa * sb
  const r10 = cg * sa + ca * sb * sg; const r11 = ca * cb; const r12 = sa * sg - ca * cg * sb
  const r20 = -cb * sg; const r21 = sb; const r22 = cb * cg
  const apply = (x: number, y: number, z: number): Vec3 => [r00 * x + r01 * y + r02 * z, r10 * x + r11 * y + r12 * z, r20 * x + r21 * y + r22 * z]
  const s = screenAngle * RAD
  const forward = apply(0, 0, -1)
  const up = apply(Math.sin(s), Math.cos(s), 0)
  return { forward: earthToScene(forward), up: earthToScene(up) }
}

/** iOS gives a relative alpha and the true heading apart (webkitCompassHeading): the absolute alpha from it. */
export function alphaFromCompass(compassHeading: number): number {
  return (360 - compassHeading + 360) % 360
}

/** A pose from a heading (degrees clockwise from north), a pitch (degrees, up positive) and a roll (degrees, clockwise). */
export function poseFrom(heading: number, pitch: number, roll = 0): Pose {
  const h = heading * RAD
  const p = pitch * RAD
  const forward: Vec3 = [Math.sin(h) * Math.cos(p), Math.sin(p), -Math.cos(h) * Math.cos(p)]
  // Level right and level up of that direction, then the roll between them.
  const right = normalize(cross(forward, [0, 1, 0]))
  const levelUp = cross(right, forward)
  const r = roll * RAD
  const up = normalize(add(scale(levelUp, Math.cos(r)), scale(right, Math.sin(r))))
  return { forward: normalize(forward), up }
}

/** Heading (degrees clockwise from north, 0–360) and pitch (degrees, up positive) of a pose. */
export function headingPitch(pose: Pose): { heading: number; pitch: number } {
  const [x, y, z] = pose.forward
  const heading = (Math.atan2(x, -z) / RAD + 360) % 360
  const pitch = Math.asin(Math.max(-1, Math.min(1, y))) / RAD
  return { heading, pitch }
}

/**
 * The person's correction on top of the sensors: the view turned by
 * `heading` degrees around the vertical (compasses are often 10° off near a
 * car or a fence), then tilted by `pitch` degrees around its own level
 * right (the phone's tilt sensor is good, a photo's is unknown).
 */
export function corrected(pose: Pose, heading: number, pitch: number): Pose {
  let { forward, up } = pose
  if (heading) {
    const angle = -heading * RAD
    forward = rotateY(forward, angle)
    up = rotateY(up, angle)
  }
  if (pitch) {
    const right = normalize(cross(forward, [0, 1, 0]))
    if (Number.isFinite(right[0])) {
      forward = rotateAround(forward, right, pitch * RAD)
      up = rotateAround(up, right, pitch * RAD)
    }
  }
  return { forward: normalize(forward), up: normalize(up) }
}

/** Halfway (share `k`) from a pose to the next reading: the sensors shake, the view should not. */
export function smoothed(previous: Pose | null, next: Pose, k = 0.25): Pose {
  if (!previous) return next
  // A jump (the compass recalibrating, a half turn) is followed at once.
  if (dot(previous.forward, next.forward) < 0.5) return next
  return {
    forward: normalize(add(scale(previous.forward, 1 - k), scale(next.forward, k))),
    up: normalize(add(scale(previous.up, 1 - k), scale(next.up, k))),
  }
}

// ---- The camera's field of view --------------------------------------------------

/** The main camera of most phones, as a 35 mm equivalent focal length. */
export const PHONE_FOCAL_35MM = 26
/** The diagonal of a 24 × 36 mm frame, which « 35 mm equivalent » refers to. */
const FULL_FRAME_DIAGONAL = Math.hypot(24, 36)

/** Vertical field of view (degrees) of a picture `width` × `height` taken at a 35 mm equivalent focal length. */
export function verticalFov(focal35: number | null | undefined, width: number, height: number): number {
  const focal = focal35 && focal35 > 5 && focal35 < 400 ? focal35 : PHONE_FOCAL_35MM
  const diagonalFov = 2 * Math.atan(FULL_FRAME_DIAGONAL / (2 * focal))
  const focalPx = Math.hypot(width, height) / (2 * Math.tan(diagonalFov / 2))
  return (2 * Math.atan(height / (2 * focalPx))) / RAD
}

/**
 * A video `videoW` × `videoH` shown with object-fit: cover in a box `boxW`
 * × `boxH` is cropped: the vertical field of view the box shows.
 */
export function coverFov(fovV: number, videoW: number, videoH: number, boxW: number, boxH: number): number {
  const fit = Math.max(boxW / videoW, boxH / videoH)
  const shownShare = boxH / (videoH * fit)
  return (2 * Math.atan(Math.tan((fovV * RAD) / 2) * shownShare)) / RAD
}

/** The rectangle an image `w` × `h` fills inside a box with object-fit: contain. */
export function containRect(w: number, h: number, boxW: number, boxH: number): { left: number; top: number; width: number; height: number } {
  const fit = Math.min(boxW / w, boxH / h)
  const width = w * fit
  const height = h * fit
  return { left: (boxW - width) / 2, top: (boxH - height) / 2, width, height }
}

// ---- Where the person stands ----------------------------------------------------

/** Metres between two WGS84 positions (haversine, [lng, lat]). */
export function distanceM([lng1, lat1]: [number, number], [lng2, lat2]: [number, number]): number {
  const p1 = lat1 * RAD
  const p2 = lat2 * RAD
  const dp = p2 - p1
  const dl = (lng2 - lng1) * RAD
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2
  return 2 * 6371008.8 * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Bearing (degrees clockwise from north) from a point of the scene to another, x east and z south. */
export function bearingTo(from: { x: number; z: number }, to: { x: number; z: number }): number {
  return (Math.atan2(to.x - from.x, -(to.z - from.z)) / RAD + 360) % 360
}

// ---- Vectors ----------------------------------------------------------------------

function earthToScene([x, y, z]: Vec3): Vec3 {
  return [x, z, -y]
}

function add(a: Vec3, b: Vec3): Vec3 { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]] }
function scale(a: Vec3, k: number): Vec3 { return [a[0] * k, a[1] * k, a[2] * k] }
function dot(a: Vec3, b: Vec3): number { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2] }
function cross(a: Vec3, b: Vec3): Vec3 { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]] }
function normalize(a: Vec3): Vec3 {
  const n = Math.hypot(a[0], a[1], a[2])
  return n ? [a[0] / n, a[1] / n, a[2] / n] : a
}

/** Turned by `angle` radians around the vertical (y), counter-clockwise seen from above. */
function rotateY([x, y, z]: Vec3, angle: number): Vec3 {
  const c = Math.cos(angle); const s = Math.sin(angle)
  return [x * c + z * s, y, -x * s + z * c]
}

/** Rodrigues' rotation of `v` by `angle` radians around the unit axis `k`. */
function rotateAround(v: Vec3, k: Vec3, angle: number): Vec3 {
  const c = Math.cos(angle); const s = Math.sin(angle)
  return add(add(scale(v, c), scale(cross(k, v), s)), scale(k, dot(k, v) * (1 - c)))
}
