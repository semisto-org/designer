// The planting round (« tournée de plantation »): from where the person
// stands to the nearest plant still to plant, then the next one, the way
// Mergin Maps' stake-out leads a surveyor to a point. Pure, so it is tested.
import { anchor, bearing, distance } from './geo'
import { compass, type Direction } from './terrain'
import type { MapFeature, Position } from './types'

/** A plant of the design not yet in the ground. */
export const toPlant = (f: MapFeature) =>
  f.properties.kind === 'plant' && f.properties.status === 'active' && !f.properties.planted_on && f.id > 0

export type Target = { feature: MapFeature; meters: number; bearing: number; direction: Direction }

/** The nearest plant still to plant, leaving out the ones skipped on this round. */
export function nextTarget(features: MapFeature[], me: Position, skipped: ReadonlySet<number> = new Set()): Target | null {
  let best: Target | null = null
  for (const feature of features) {
    if (!toPlant(feature) || skipped.has(feature.id)) continue
    const point = anchor(feature.geometry)
    const meters = distance(me, point)
    if (!best || meters < best.meters) {
      const deg = bearing(me, point)
      best = { feature, meters, bearing: deg, direction: compass(deg) }
    }
  }
  return best
}

/**
 * Close enough to plant: within 2 m, or within what the GPS can tell
 * apart (a phone is often good to 3 to 5 m), capped at 6 m.
 */
export function arrived(meters: number, accuracy: number | null): boolean {
  return meters <= Math.min(6, Math.max(2, accuracy ?? 0))
}

/** Where the arrow points on screen: the target's bearing seen from the way the phone faces. */
export function arrowAngle(targetBearing: number, heading: number | null): number | null {
  if (heading === null || heading < 0) return null
  return (targetBearing - heading + 360) % 360
}

export function remaining(features: MapFeature[]): number {
  return features.filter(toPlant).length
}
