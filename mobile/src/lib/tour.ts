// The planting rounds: from where the person stands to the nearest plant
// still to plant (« tournée de plantation »), then the next one, the way
// Mergin Maps' stake-out leads a surveyor to a point; in spring, the same
// walk to the young plants whose take is still to check (« tournée de
// reprise »). Pure, so it is tested.
import { anchor, bearing, distance } from './geo'
import type { Op } from './outbox-core'
import { compass, type Direction } from './terrain'
import type { MapFeature, Position, TakeRound } from './types'

export type Round = 'plant' | 'take'

/** A plant of the design not yet in the ground. */
export const toPlant = (f: MapFeature) =>
  f.properties.kind === 'plant' && f.properties.status === 'active' && !f.properties.planted_on && f.id > 0

export type Target = { feature: MapFeature; meters: number; bearing: number; direction: Direction }

/** The nearest plant the round leads to (by default, still to plant), leaving out the ones skipped on this round. */
export function nextTarget(features: MapFeature[], me: Position, skipped: ReadonlySet<number> = new Set(), wanted: (f: MapFeature) => boolean = toPlant): Target | null {
  let best: Target | null = null
  for (const feature of features) {
    if (!wanted(feature) || skipped.has(feature.id)) continue
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

/**
 * The plants whose take is still to check: the server's list, without the
 * ones checked on this phone since (a follow-up waiting in the outbox) and
 * the ones no longer on the map.
 */
export function takeDue(round: TakeRound | undefined, features: MapFeature[], ops: readonly Op[], since = round?.since): Set<number> {
  if (!round) return new Set()
  const checked = new Set(ops.flatMap((op) =>
    op.type === 'createObservation' && (op.kind ?? 'follow_up') === 'follow_up' && (!since || op.observedOn >= since) ? [op.featureId] : []))
  const present = new Set(features.filter((f) => f.properties.kind === 'plant' && f.properties.status === 'active').map((f) => f.id))
  return new Set(round.due.map((d) => d.id).filter((id) => present.has(id) && !checked.has(id)))
}

/** The last check of a plant on the take round, to say « l'an dernier : en difficulté ». */
export function lastCheck(round: TakeRound | undefined, featureId: number) {
  return round?.due.find((d) => d.id === featureId) ?? null
}
