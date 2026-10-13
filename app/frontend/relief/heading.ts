// Pure geometry of the compass rose (Compass.tsx): the scene's local frame
// has x to the east and z to the south, so north is -z.

type Point = { x: number; z: number }

/** Where a camera at `from` looking at `to` faces, in radians clockwise from north. */
export function headingOf(from: Point, to: Point): number {
  return Math.atan2(to.x - from.x, -(to.z - from.z))
}

/** The eighth of the compass a heading (degrees) falls in: 0 north, 1 north-east … 7 north-west. */
export function eighthOf(degrees: number): number {
  return Math.round((((degrees % 360) + 360) % 360) / 45) % 8
}

/** Where a letter for `bearing` (degrees) sits on a rose of centre (50, 50) when the view faces `heading` (degrees). */
export function letterPosition(bearing: number, heading: number, radius: number): { x: number; y: number } {
  const angle = ((bearing - heading) * Math.PI) / 180
  return { x: 50 + radius * Math.sin(angle), y: 50 - radius * Math.cos(angle) }
}
