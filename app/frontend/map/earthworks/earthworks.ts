/**
 * Earthworks of a design: how much soil each dug element takes out (pond,
 * swale, ditch, rain garden, sunken path), how much of it is topsoil, and
 * where it goes (a mound or a raised bed on the map, the swale's own berm,
 * spread on site, a heap for later, or off the site).
 *
 * Volumes are estimates from the drawn shape and its depth, never from the
 * relief: the same formulas the inspector already shows for water volumes,
 * so the water a pond holds and the soil it gives back agree. Pure helpers,
 * shared by the « Terres » panel, the inspector section and the map arrows.
 */

/** Area (m²) of a surface, length (m) of a line, from the shape shown on the map. */
export type Measure = { area: number | null; length: number | null }

type Properties = Record<string, unknown>
type Item = { id: number; kind: string; properties: Properties; measure: Measure }

/** Where a part of the soil goes: a feature of the map (its id) or one of these. */
export const DESTINATIONS = ['berm', 'spread', 'stockpile', 'removed'] as const
export type DestinationKeyword = (typeof DESTINATIONS)[number]
export type Destination = number | DestinationKeyword

/** The two parts of the soil, each with its own destination. */
export const SOIL_PARTS = ['topsoil', 'subsoil'] as const
export type SoilPart = (typeof SOIL_PARTS)[number]
export const DESTINATION_KEY: Record<SoilPart, string> = { topsoil: 'topsoil_to', subsoil: 'subsoil_to' }

/** Depth of the living, dark top layer kept apart, unless the element says otherwise. */
export const TOPSOIL_CM_DEFAULT = 25

/**
 * Dug soil takes more room than in the ground: about a quarter more for an
 * ordinary loam (a third or more for clay). It settles back once placed.
 */
export const BULKING = 1.25

/** A builder's wheelbarrow (80 L) and a tipper truck (8 m³), of loose soil. */
export const WHEELBARROW_M3 = 0.08
export const TRUCK_M3 = 8

const num = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null)

/**
 * Excavation of one element: volume in place, depth, and its profile, 1 for
 * straight sides (a sunken path, a rain garden) or 0,5 for sloping ones (a
 * pond's gentle banks, a swale's V), which is also the share of the opening
 * times depth that the hole holds.
 */
type Cut = { volume: number; depth: number; profile: 1 | 0.5 }

// Same shapes as the water estimates (map/drawing/computed.ts): gentle banks
// for a pond, a V profile for a swale or a ditch, flat bottom elsewhere.
const CUTS: Record<string, (p: Properties, m: Measure) => Cut | null> = {
  pond: (p, m) => surfaceCut(p, m, 0.5),
  swale: (p, m) => lineCut(p, m, 0.5, 'depth_m'),
  ditch: (p, m) => lineCut(p, m, 0.5, 'depth_m'),
  rain_garden: (p, m) => surfaceCut(p, m, 1),
  path: (p, m) => lineCut(p, m, 1, 'dug_depth_m'),
  track: (p, m) => lineCut(p, m, 1, 'dug_depth_m'),
}

function surfaceCut(p: Properties, m: Measure, profile: 1 | 0.5): Cut | null {
  const depth = num(p.depth_m)
  if (!m.area || !depth) return null
  return { volume: m.area * depth * profile, depth, profile }
}

function lineCut(p: Properties, m: Measure, profile: 1 | 0.5, depthKey: string): Cut | null {
  const width = num(p.width_m)
  const depth = num(p[depthKey])
  if (!m.length || !width || !depth) return null
  return { volume: m.length * width * depth * profile, depth, profile }
}

/**
 * Share of the dug volume that is topsoil, the top `t` metres: with straight
 * sides it is t / depth; with sloping sides the hole narrows as it deepens,
 * so the top layer weighs more (similar profiles: 1 − ((depth − t) / depth)²).
 */
function topsoilShare(cut: Cut, t: number): number {
  if (t >= cut.depth) return 1
  return cut.profile === 1 ? t / cut.depth : 1 - ((cut.depth - t) / cut.depth) ** 2
}

/** Kinds that take soil out when they are dug. */
export const DIGGABLE_KINDS = Object.keys(CUTS)

/**
 * Kinds that receive soil, with how much they hold (m³, in place): a mound
 * has rounded sides (half its footprint × height), a raised bed is filled to
 * the brim, a zone has no capacity (the soil is spread on it).
 */
const CAPACITIES: Record<string, (p: Properties, m: Measure) => number | null> = {
  mound: (p, m) => (m.area && num(p.height_m) ? m.area * num(p.height_m)! * 0.5 : null),
  raised_bed: (p, m) => (m.area && num(p.height_m) ? m.area * num(p.height_m)! : null),
  zone: () => null,
}

export const RECEIVING_KINDS = Object.keys(CAPACITIES)

export function isDiggable(kind: unknown): boolean {
  return typeof kind === 'string' && kind in CUTS
}

export function isReceiving(kind: unknown): boolean {
  return typeof kind === 'string' && kind in CAPACITIES
}

/** The destination stored on a feature for one part, or null when undecided. */
export function destinationOf(properties: Properties, part: SoilPart): Destination | null {
  const value = properties[DESTINATION_KEY[part]]
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) return value
  if (typeof value === 'string' && (DESTINATIONS as readonly string[]).includes(value)) return value as DestinationKeyword
  return null
}

export function topsoilCm(properties: Properties): number {
  const value = num(properties.topsoil_cm)
  return value != null && value >= 0 ? value : TOPSOIL_CM_DEFAULT
}

export type Excavation = {
  /** m³ in the ground. */
  volume: number
  /** m³ of topsoil (the top layer over the opening), the rest is subsoil. */
  topsoil: number
  subsoil: number
  /** m³ once dug: what the wheelbarrows and trucks carry. */
  loose: number
  wheelbarrows: number
  trucks: number
}

/** What digging this element takes out, or null when it digs nothing (or a value is missing). */
export function excavation(kind: string, properties: Properties, measure: Measure): Excavation | null {
  const cut = CUTS[kind]?.(properties, measure)
  if (!cut || cut.volume <= 0) return null
  const topsoil = cut.volume * topsoilShare(cut, topsoilCm(properties) / 100)
  const loose = cut.volume * BULKING
  return {
    volume: cut.volume,
    topsoil,
    subsoil: cut.volume - topsoil,
    loose,
    wheelbarrows: Math.ceil(loose / WHEELBARROW_M3),
    trucks: Math.ceil(loose / TRUCK_M3),
  }
}

/** How much soil a receiving element holds (m³ in place), or null (a zone, a missing height). */
export function capacity(kind: string, properties: Properties, measure: Measure): number | null {
  return CAPACITIES[kind]?.(properties, measure) ?? null
}

/** Already dug (the land as it is): out of the balance and of the arrows. */
export function isDone(properties: Properties): boolean {
  return properties.dug === true
}

export type Dig = { id: number; kind: string; excavation: Excavation; to: Record<SoilPart, Destination | null> }
export type Receiver = {
  id: number
  kind: string
  capacity: number | null
  /** m³ in place sent to it, by part. */
  received: Record<SoilPart, number>
  /** Thickness (m) the received soil makes when spread over its surface. */
  thickness: number | null
}

export type Balance = {
  digs: Dig[]
  receivers: Receiver[]
  /** m³ in place. */
  totals: {
    volume: number
    topsoil: number
    subsoil: number
    loose: number
    /** To a mound, a raised bed or a zone of the map. */
    placed: number
    /** Next to the dig (berm, banks), spread on site or heaped for later. */
    onSite: number
    removed: number
    undecided: number
  }
}

/**
 * The earthworks balance of a design. `items` are the features to count
 * (active ones of the version shown); already dug elements are left out.
 * A destination pointing to a feature that is not a receiver (deleted,
 * redrawn as something else) counts as undecided.
 */
export function earthworksBalance(items: Item[]): Balance {
  const receivers = new Map<number, Receiver>()
  for (const item of items) {
    if (!isReceiving(item.kind)) continue
    receivers.set(item.id, {
      id: item.id, kind: item.kind,
      capacity: capacity(item.kind, item.properties, item.measure),
      received: { topsoil: 0, subsoil: 0 },
      thickness: null,
    })
  }
  const area = new Map(items.map((item) => [item.id, item.measure.area]))

  const digs: Dig[] = []
  const totals = { volume: 0, topsoil: 0, subsoil: 0, loose: 0, placed: 0, onSite: 0, removed: 0, undecided: 0 }
  for (const item of items) {
    if (isDone(item.properties)) continue
    const dug = excavation(item.kind, item.properties, item.measure)
    if (!dug) continue
    const to = { topsoil: destinationOf(item.properties, 'topsoil'), subsoil: destinationOf(item.properties, 'subsoil') }
    for (const part of SOIL_PARTS) {
      let target = to[part]
      if (typeof target === 'number' && (!receivers.has(target) || target === item.id)) target = to[part] = null
      const amount = dug[part]
      if (target == null) totals.undecided += amount
      else if (typeof target === 'number') {
        receivers.get(target)!.received[part] += amount
        totals.placed += amount
      } else if (target === 'removed') totals.removed += amount
      else totals.onSite += amount
    }
    totals.volume += dug.volume
    totals.topsoil += dug.topsoil
    totals.subsoil += dug.subsoil
    totals.loose += dug.loose
    digs.push({ id: item.id, kind: item.kind, excavation: dug, to })
  }
  for (const receiver of receivers.values()) {
    const surface = area.get(receiver.id)
    const received = receiver.received.topsoil + receiver.received.subsoil
    receiver.thickness = surface && received > 0 ? received / surface : null
  }
  return { digs, receivers: [...receivers.values()], totals }
}

/** How a receiver stands: room left (positive) or soil too much (negative), m³; null without capacity. */
export function receiverGap(receiver: Receiver): number | null {
  if (receiver.capacity == null) return null
  return receiver.capacity - receiver.received.topsoil - receiver.received.subsoil
}
