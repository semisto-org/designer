// Pure helpers (no MapLibre, no aliases): tested with node:test in
// test/frontend/plan_images/.
//
// A plan image is posed by its center (WGS84), its width on the ground in
// meters and its rotation in degrees clockwise from north; its height
// follows the aspect ratio (width / height). At the scale of a garden a
// local flat projection around the center is exact to the centimeter.

export type Pose = { centerLng: number; centerLat: number; widthM: number; rotation: number; aspect: number }

export type LngLat = [number, number]

/** Source and layer ids of plan images: `plan-image-<id>`. */
export const PLAN_IMAGE_PREFIX = 'plan-image-'

export const planImageLayerId = (id: number) => `${PLAN_IMAGE_PREFIX}${id}`

export function planImageIdOf(id: string | undefined): number | null {
  if (!id?.startsWith(PLAN_IMAGE_PREFIX)) return null
  const value = Number(id.slice(PLAN_IMAGE_PREFIX.length))
  return Number.isInteger(value) && value > 0 ? value : null
}

const METERS_PER_DEGREE = 111_320
export const MIN_WIDTH_M = 0.1
export const MAX_WIDTH_M = 20_000

const toRad = (deg: number) => (deg * Math.PI) / 180
const toDeg = (rad: number) => (rad * 180) / Math.PI

/** Meters east and north of the pose's center. */
export function toLocal(pose: Pick<Pose, 'centerLng' | 'centerLat'>, [lng, lat]: LngLat): [number, number] {
  const east = (lng - pose.centerLng) * METERS_PER_DEGREE * Math.cos(toRad(pose.centerLat))
  const north = (lat - pose.centerLat) * METERS_PER_DEGREE
  return [east, north]
}

export function fromLocal(pose: Pick<Pose, 'centerLng' | 'centerLat'>, [east, north]: [number, number]): LngLat {
  return [
    pose.centerLng + east / (METERS_PER_DEGREE * Math.cos(toRad(pose.centerLat))),
    pose.centerLat + north / METERS_PER_DEGREE,
  ]
}

/** Image coordinates (x right, y up, meters from the center) to east/north. */
function rotate(rotation: number, [x, y]: [number, number]): [number, number] {
  const theta = toRad(rotation)
  return [x * Math.cos(theta) + y * Math.sin(theta), -x * Math.sin(theta) + y * Math.cos(theta)]
}

/** East/north to image coordinates (x right, y up). */
function unrotate(rotation: number, [east, north]: [number, number]): [number, number] {
  const theta = toRad(rotation)
  return [east * Math.cos(theta) - north * Math.sin(theta), east * Math.sin(theta) + north * Math.cos(theta)]
}

export const heightOf = (pose: Pose) => pose.widthM / pose.aspect

/**
 * The four corners as MapLibre's image source wants them: top left, top
 * right, bottom right, bottom left.
 */
export function corners(pose: Pose): [LngLat, LngLat, LngLat, LngLat] {
  const w = pose.widthM / 2
  const h = heightOf(pose) / 2
  const points: [number, number][] = [[-w, h], [w, h], [w, -h], [-w, -h]]
  return points.map((p) => fromLocal(pose, rotate(pose.rotation, p))) as [LngLat, LngLat, LngLat, LngLat]
}

/** Where the rotation handle sits: above the middle of the top edge. */
export function rotationHandle(pose: Pose, offsetM: number): LngLat {
  return fromLocal(pose, rotate(pose.rotation, [0, heightOf(pose) / 2 + offsetM]))
}

/** Is the point on the image? */
export function contains(pose: Pose, point: LngLat): boolean {
  const [x, y] = unrotate(pose.rotation, toLocal(pose, point))
  return Math.abs(x) <= pose.widthM / 2 && Math.abs(y) <= heightOf(pose) / 2
}

/** The pose moved by the drag from `from` to `to`. */
export function moved(pose: Pose, from: LngLat, to: LngLat): Pose {
  const [east, north] = toLocal(pose, to)
  const [east0, north0] = toLocal(pose, from)
  const [centerLng, centerLat] = fromLocal(pose, [east - east0, north - north0])
  return { ...pose, centerLng, centerLat }
}

/**
 * The pose scaled so that a corner follows the pointer: the center stays,
 * the aspect ratio too, the width follows the pointer's distance.
 */
export function scaledTo(pose: Pose, pointer: LngLat): Pose {
  const [east, north] = toLocal(pose, pointer)
  const distance = Math.hypot(east, north)
  const halfDiagonalPerWidth = Math.hypot(0.5, 0.5 / pose.aspect)
  const widthM = Math.min(MAX_WIDTH_M, Math.max(MIN_WIDTH_M, distance / halfDiagonalPerWidth))
  return { ...pose, widthM }
}

/** The pose turned so that its top points to the pointer. */
export function rotatedTowards(pose: Pose, pointer: LngLat): Pose {
  const [east, north] = toLocal(pose, pointer)
  if (east === 0 && north === 0) return pose
  const bearing = toDeg(Math.atan2(east, north))
  return { ...pose, rotation: Math.round(((bearing % 360) + 360) % 360 * 10) / 10 }
}

/**
 * A first pose for a new image: centered on the view, half as wide as
 * the view (less when the image is tall), north up.
 */
export function initialPose(center: LngLat, viewWidthM: number, viewHeightM: number, aspect: number): Pose {
  const widthM = Math.max(MIN_WIDTH_M, Math.min(viewWidthM * 0.5, viewHeightM * 0.5 * aspect))
  return { centerLng: center[0], centerLat: center[1], widthM, rotation: 0, aspect }
}

/**
 * Where the plan image layers must go in the style's layer `order` (bottom
 * to top): right above the topmost "floor" layer (base map or drone view),
 * in the given order, under every overlay and the drawing. Returns null
 * when they already are there, else the id to insert them before
 * (undefined: on top).
 */
export function planImagesMove(order: string[], wanted: string[], isFloor: (id: string) => boolean): { before: string | undefined } | null {
  const ours = order.filter((id) => planImageIdOf(id) != null)
  if (ours.length === 0) return null
  const others = order.filter((id) => planImageIdOf(id) == null)
  let floor = -1
  others.forEach((id, index) => {
    if (isFloor(id)) floor = index
  })
  const before = others[floor + 1]
  const low = floor >= 0 ? order.indexOf(others[floor]) : -1
  const high = before ? order.indexOf(before) : order.length
  const inPlace = ours.every((id) => {
    const index = order.indexOf(id)
    return index > low && index < high
  })
  const sequence = wanted.filter((id) => ours.includes(id))
  const inOrder = sequence.every((id, index) => ours[index] === id)
  return inPlace && inOrder ? null : { before }
}
