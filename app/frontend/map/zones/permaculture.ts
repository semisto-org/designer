/**
 * Permaculture zones 0 to 5: the terrain divided by how often one goes
 * there. Zone 0 is the house, zone 1 what one passes every day (herbs,
 * salads, compost, hens), zone 2 a few times a week (fruit, soft fruit,
 * greenhouse), zone 3 a few times a month (orchard, larger animals), zone 4
 * a few times a year (wood, forage, wild harvest) and zone 5 the wild part,
 * left alone, where one goes to learn.
 *
 * A zone is a `permaculture_zone` feature of the notes layer, a polygon with
 * its number in `properties.zone_number`. Zones may overlap (a zone 2 drawn
 * as a large blob around a zone 1): a place belongs to the lowest number
 * that covers it. Zone 0 is also every building marked as the dwelling
 * (`properties.dwelling`).
 *
 * Pure helpers, shared by the « Zones » panel, the inspector and the tests.
 */

import { along, area, booleanPointInPolygon, buffer, difference, featureCollection, intersect, length, lineString, pointOnFeature, union } from '@turf/turf'
import type { Feature, Geometry, LineString, MultiPolygon, Polygon, Position } from 'geojson'
import { bearing, sweep } from '../sectors/sectors.ts'

export const ZONE_NUMBERS = [0, 1, 2, 3, 4, 5] as const
export type ZoneNumber = (typeof ZONE_NUMBERS)[number]

export const PERMACULTURE_ZONE_KIND = 'permaculture_zone'

/** From the warm earth of the house to the deep green of the wild. */
export const PERMACULTURE_ZONE_COLORS: Record<ZoneNumber, string> = {
  0: '#8b5e3c',
  1: '#e07b5f',
  2: '#e8b33a',
  3: '#a3bb8a',
  4: '#5f9a78',
  5: '#2f6b55',
}

/**
 * How far out each zone reaches from the house when Terranova proposes them,
 * in metres. Rule-of-thumb distances for a family garden in Europe (walking
 * time, not a rule): the person then reshapes them to how they really live.
 * Zone 5 is never proposed: the wild part is chosen, not computed.
 */
export const ZONE_REACH_M: Record<1 | 2 | 3 | 4, number> = { 1: 15, 2: 40, 3: 100, 4: 250 }

/** A piece of a ring smaller than this is a sliver left by a path's edge: dropped. */
export const MIN_PIECE_M2 = 50

/** Within a zone's reach, a path widens it this much on each side, as a share of the reach: one goes more often where one walks. */
const PATH_WIDTH_SHARE = 0.35

export const isZoneNumber = (value: unknown): value is ZoneNumber =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 5

type Props = { [key: string]: unknown }
type Shape = { geometry: Geometry; properties: Props }

export const isPermacultureZone = (f: Shape) =>
  f.properties.kind === PERMACULTURE_ZONE_KIND && (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon')

/** A building marked as the house people live in: zone 0. */
export const isDwelling = (f: Shape) =>
  f.properties.kind === 'building' && f.properties.dwelling === true && f.geometry.type === 'Polygon'

export function zoneNumberOf(f: Shape): ZoneNumber | null {
  const n = typeof f.properties.zone_number === 'string' ? Number(f.properties.zone_number) : f.properties.zone_number
  return isZoneNumber(n) ? n : null
}

const live = (f: Shape) => f.properties.status === 'active'

/** Where an element stands, to find its zone: itself for a point, a point inside it for a surface, halfway along a line (as PermacultureZones::Lookup). */
export function anchorOf(geometry: Geometry): Position | null {
  if (geometry.type === 'Point') return geometry.coordinates
  if (geometry.type === 'LineString') {
    if (geometry.coordinates.length < 2) return geometry.coordinates[0] ?? null
    const line = lineString(geometry.coordinates)
    return along(line, length(line) / 2).geometry.coordinates
  }
  try {
    return pointOnFeature({ type: 'Feature', geometry, properties: {} }).geometry.coordinates
  } catch {
    return null
  }
}

/**
 * The zone of a place: 0 inside the house, else the lowest-numbered zone
 * drawn over it, or null outside every zone.
 */
export function zoneAt(point: Position, features: readonly Shape[]): ZoneNumber | null {
  let best: ZoneNumber | null = null
  for (const f of features) {
    if (!live(f)) continue
    const n = isDwelling(f) ? 0 : isPermacultureZone(f) ? zoneNumberOf(f) : null
    if (n == null || (best != null && n >= best)) continue
    if (booleanPointInPolygon(point, f.geometry as Polygon | MultiPolygon)) best = n
  }
  return best
}

/** The zone of an element (null for the zones themselves, sectors, notes and what lies outside every zone). */
export function zoneOfFeature(feature: Shape, features: readonly Shape[]): ZoneNumber | null {
  if (isPermacultureZone(feature) || isDwelling(feature) || feature.properties.layer === 'notes') return null
  const anchor = anchorOf(feature.geometry)
  return anchor ? zoneAt(anchor, features) : null
}

type Area = Feature<Polygon | MultiPolygon>

const asFeature = (geometry: Polygon | MultiPolygon): Area => ({ type: 'Feature', geometry, properties: {} })

function unite(parts: (Area | null | undefined)[]): Area | null {
  const present = parts.filter((p): p is Area => p != null)
  if (present.length === 0) return null
  if (present.length === 1) return present[0]
  return union(featureCollection(present)) as Area | null
}

function clip(a: Area | null, b: Area | null): Area | null {
  if (!a || !b) return null
  return intersect(featureCollection([a, b])) as Area | null
}

function minus(a: Area | null, b: Area | null): Area | null {
  if (!a) return null
  if (!b) return a
  return difference(featureCollection([a, b])) as Area | null
}

export type ProposedZone = { number: 1 | 2 | 3 | 4; geometry: Polygon; areaM2: number }

/**
 * Zones 1 to 4 proposed from the house: each reaches `ZONE_REACH_M` from its
 * walls, and further along the paths that leave it (one goes more often
 * where one walks), cut to the terrain, each ring without the zones inside
 * it, one polygon per piece of a ring (as PermacultureZones::Proposal).
 * Slivers under MIN_PIECE_M2 are dropped. The house itself is zone 0 and
 * is not drawn.
 */
export function proposeZones({ houses, paths, boundary }: { houses: Polygon[]; paths: LineString[]; boundary: Polygon | MultiPolygon }): ProposedZone[] {
  if (houses.length === 0) return []
  const terrain = asFeature(boundary)
  const house = unite(houses.map(asFeature))
  const out: ProposedZone[] = []
  let inner = house
  for (const number of [1, 2, 3, 4] as const) {
    const reach = ZONE_REACH_M[number]
    const around = buffer(house!, reach, { units: 'meters' }) as Area | undefined
    // The paths that start within this zone's reach widen it along them, up to half as far again.
    const near = buffer(house!, reach * 1.5, { units: 'meters' }) as Area | undefined
    const along = paths.flatMap((p) => {
      const kept = clip(buffer(lineString(p.coordinates), reach * PATH_WIDTH_SHARE, { units: 'meters' }) as Area, near ?? null)
      return kept ? [kept] : []
    })
    const reached = unite([around, ...along])
    const ring = clip(minus(reached, inner), terrain)
    // A ring in several pieces gives one polygon per piece, each reshapable on its own.
    const parts: Polygon[] = !ring ? [] : ring.geometry.type === 'Polygon'
      ? [ring.geometry]
      : ring.geometry.coordinates.map((coordinates) => ({ type: 'Polygon', coordinates }))
    for (const part of parts) {
      const m2 = area(part)
      if (m2 >= MIN_PIECE_M2) out.push({ number, geometry: part, areaM2: m2 })
    }
    inner = unite([inner, reached])
    // Once the terrain is covered, the further zones have nothing left.
    if (!minus(terrain, inner)) break
  }
  return out
}

/**
 * Where each kind of element belongs, by how often it needs a visit (the
 * relative location of Mollison and Lawton): `[nearest, farthest]` zones.
 * The companion warns when one stands outside its range.
 */
export const KIND_ZONES: Record<string, [ZoneNumber, ZoneNumber]> = {
  raised_bed: [1, 2],
  greenhouse: [1, 2],
  compost: [1, 2],
  poultry_house: [1, 2],
  fruit_store: [1, 2],
  playground: [1, 2],
  shed: [1, 3],
  beehive: [2, 4],
  paddock: [2, 4],
}

export type ZoneAdvice =
  | { kind: 'placement'; featureId: number; elementKind: string; name: string | null; zone: ZoneNumber; range: [ZoneNumber, ZoneNumber]; tooFar: boolean }
  | { kind: 'no_wild' }
  | { kind: 'no_house' }
  | { kind: 'wind_unsheltered'; sectorId: number; from: number; to: number; cold: boolean }
  | { kind: 'fire_side'; sectorId: number; from: number; to: number }

type Element = Shape & { properties: Props & { id: number } }
type SectorRange = { id: number; type: string; from: number; to: number }

const SHELTER_KINDS = ['windbreak', 'hedge', 'existing_hedge', 'hedge_bank']

/** Whether `deg` lies within the arc from `from` clockwise to `to`, `slack` degrees each side. */
function within(deg: number, from: number, to: number, slack = 10): boolean {
  const span = sweep(from, to)
  if (span >= 360 - 2 * slack) return true
  return ((deg - from + slack + 720) % 360) <= span + 2 * slack
}

/**
 * What the companion says of the zones: elements outside the zones they
 * need, no wild zone 5, and the zones crossed with the sectors (a wind that
 * meets no hedge on its side of the house, a side the fire can come from).
 */
export function zoneAdvice(features: readonly Element[], sectors: readonly SectorRange[]): ZoneAdvice[] {
  const active = features.filter(live)
  const zones = active.filter(isPermacultureZone)
  const houses = active.filter(isDwelling)
  const out: ZoneAdvice[] = []
  if (zones.length === 0 && houses.length === 0) return out
  if (houses.length === 0) out.push({ kind: 'no_house' })
  for (const f of active) {
    const range = typeof f.properties.kind === 'string' ? KIND_ZONES[f.properties.kind] : undefined
    if (!range) continue
    const zone = zoneOfFeature(f, active)
    if (zone == null || (zone >= range[0] && zone <= range[1])) continue
    out.push({ kind: 'placement', featureId: f.properties.id, elementKind: f.properties.kind as string, name: typeof f.properties.name === 'string' && f.properties.name.trim() ? f.properties.name.trim() : null, zone, range, tooFar: zone > range[1] })
  }
  if (zones.length > 0 && !zones.some((z) => zoneNumberOf(z) === 5)) out.push({ kind: 'no_wild' })

  const centre = houses.length ? anchorOf(houses[0].geometry) : null
  if (centre) {
    const shelters = active.filter((f) => SHELTER_KINDS.includes(f.properties.kind as string))
    for (const s of sectors) {
      if (s.type === 'wind' || s.type === 'cold_wind') {
        const sheltered = shelters.some((h) => {
          const at = anchorOf(h.geometry)
          return at != null && within(bearing(centre, at), s.from, s.to)
        })
        if (!sheltered) out.push({ kind: 'wind_unsheltered', sectorId: s.id, from: s.from, to: s.to, cold: s.type === 'cold_wind' })
      } else if (s.type === 'fire') {
        out.push({ kind: 'fire_side', sectorId: s.id, from: s.from, to: s.to })
      }
    }
  }
  return out
}
