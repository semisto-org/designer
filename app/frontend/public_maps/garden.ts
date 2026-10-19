// The published garden growing year after year, as the public view and its
// link preview paint it: each plant of the snapshot (and the plants of each
// patch, spread over it) with the watercolour crown of the home page's
// time-lapse that fits its species and the season, sized by the growth model
// of the 3D view (relief/growth.ts). Pure functions: tested in
// test/frontend/public_maps.

import type { FeatureCollection, Point, Position } from 'geojson'
import { LOOKS, SMALL_SPRITE, SPRITE, spriteRect, type SpriteKey } from '../components/site/timelapse/paint.ts'
import { seasonAt, type SpeciesKey } from '../components/site/timelapse/model.ts'
import {
  graftOf, insideRing, plantForm, scatter, sizeAt, trainingOf, yearsBetween,
  type GrowingPatchData, type GrowingPlantData, type Graft, type PlantStrata, type PlantTraining,
} from '../relief/growth.ts'

/** The last year the public slider reaches: a forest garden is designed over thirty years. */
export const GARDEN_YEARS = 30

/** What a snapshot keeps of the growth data (Collab::PublicSnapshot#growth): no plant's own name or number. */
export type PublicGrowth = {
  today: string
  origin: string
  plants: Omit<GrowingPlantData, 'ownName' | 'number'>[]
  patches: Omit<GrowingPatchData, 'name'>[]
}

/** One plant of the published garden, ready to be painted. */
export type GardenPlant = {
  lng: number
  lat: number
  look: SpeciesKey
  strata: PlantStrata
  heightM: number
  spreadM: number
  maturityYears: number
  training: PlantTraining
  graft: Graft | null
  /** Years after year 0 when it goes into the ground (negative: grown already). */
  start: number
  seed: number
}

type Described = { latinName: string | null; strata: PlantStrata; plantType: string | null; foliage: string | null }

/** The time-lapse species whose paintings fit a genus, by its latin name. */
const GENUS: Record<string, SpeciesKey> = {
  juglans: 'noyer', castanea: 'chataignier', alnus: 'aulne', malus: 'pommier', mespilus: 'pommier', pyrus: 'poirier',
  cydonia: 'poirier', corylus: 'noisetier', sambucus: 'sureau', hippophae: 'argousier', rubus: 'framboisier',
  rosa: 'rosier', crataegus: 'aubepine', acer: 'erable', cornus: 'cornouiller', ilex: 'houx', symphytum: 'consoude',
  rheum: 'rhubarbe', fragaria: 'fraisier', melissa: 'melisse', allium: 'ciboulette', ajuga: 'bugle',
}

/** When the genus has no painting: a look of the same layer of the forest, picked per plant. */
const BY_STRATA: Record<PlantStrata, SpeciesKey[]> = {
  canopy: ['noyer', 'chataignier', 'aulne'],
  sub_canopy: ['pommier', 'poirier', 'cerisier'],
  shrub: ['noisetier', 'cassis', 'groseillier', 'sureau'],
  vine: ['framboisier'],
  herbaceous: ['consoude', 'rhubarbe', 'melisse'],
  root: ['ciboulette', 'melisse'],
  ground_cover: ['fraisier', 'bugle'],
  aquatic: ['melisse'],
}

/** The painting a plant is dressed with. */
export function lookOf(plant: Described, seed: number): SpeciesKey {
  const words = (plant.latinName ?? '').toLowerCase().split(/\s+/)
  const genus = words[0] ?? ''
  if (genus === 'prunus') return words[1] === 'spinosa' ? 'prunellier' : 'cerisier'
  if (genus === 'ribes') return words[1] === 'nigrum' ? 'cassis' : words[1]?.startsWith('uva') ? 'groseillier_maq' : 'groseillier'
  if (GENUS[genus]) return GENUS[genus]
  const woody = plant.strata === 'canopy' || plant.strata === 'sub_canopy' || plant.strata === 'shrub'
  if (woody && plant.foliage === 'evergreen') return 'houx'
  const choices = BY_STRATA[plant.strata] ?? BY_STRATA.shrub
  return choices[Math.abs(seed) % choices.length]
}

/**
 * The sprite of a look at a time of the year (`f`: 0 = 1 January): bare
 * branches in winter, blossom in April, leaves, fruit at the end of the
 * summer, then autumn colours.
 */
export function spriteOf(look: SpeciesKey, f: number, seed: number): SpriteKey {
  const paint = LOOKS[look]
  const s = seasonAt(f)
  if (s.autumn > 0.5 && s.leaf > 0.3) return paint.autumn
  if (paint.fruit && s.fruit > 0.5) return paint.fruit
  if (paint.blossom && s.blossom > 0.5) return paint.blossom
  if (s.leaf > 0.5 || paint.evergreen) {
    const variants = [paint.leaf, ...(paint.variants ?? [])]
    return variants[Math.abs(seed) % variants.length]
  }
  return paint.bare
}

/** The four seasons the public view can show, as a time of the year. */
export const SEASONS = { winter: 0.05, spring: 0.31, summer: 0.6, autumn: 0.8 } as const
export type SeasonKey = keyof typeof SEASONS

/** The time of the year of a date (0 = 1 January), and its season. */
export function yearFraction(date: Date): number {
  const start = Date.UTC(date.getUTCFullYear(), 0, 1)
  return (date.getTime() - start) / (365.25 * 86_400_000)
}

export function seasonOf(f: number): SeasonKey {
  if (f < 0.21 || f >= 0.97) return 'winter'
  if (f < 0.46) return 'spring'
  if (f < 0.71) return 'summer'
  return 'autumn'
}

/** Today on the slider: the years since year 0, within the slider. */
export function yearNow(growth: Pick<PublicGrowth, 'origin'>, now: Date): number {
  return Math.min(GARDEN_YEARS, Math.max(0, yearsBetween(growth.origin, now.toISOString())))
}

/** Metres east and north of a reference point (flat earth: a garden is small). */
function local(origin: Position) {
  const kx = 111_320 * Math.cos((origin[1] * Math.PI) / 180)
  const ky = 110_540
  return {
    to: ([lng, lat]: Position) => ({ x: (lng - origin[0]) * kx, y: (lat - origin[1]) * ky }),
    from: ({ x, y }: { x: number; y: number }): [number, number] => [origin[0] + x / kx, origin[1] + y / ky],
  }
}

/**
 * Every plant of the published garden: the plant points, and the plants of
 * each patch spread over it (less the points already in it for the same
 * species, painted as themselves), always at the same places.
 */
export function gardenPlants(growth: PublicGrowth): GardenPlant[] {
  const reference = growth.plants[0] ? [growth.plants[0].lng, growth.plants[0].lat] : growth.patches[0]?.ring[0]
  if (!reference) return []
  const frame = local(reference)
  const startOf = (date: string | null) => Math.max(0, yearsBetween(growth.origin, date ?? growth.today))
  const plants: GardenPlant[] = growth.plants.map((p) => {
    const form = plantForm(p.strata, p.plantType)
    const training = trainingOf(form, p.training)
    const seed = p.id * 7919
    return {
      lng: p.lng, lat: p.lat, look: lookOf(p, seed), strata: p.strata, heightM: p.heightM, spreadM: p.spreadM,
      maturityYears: p.maturityYears, training, graft: training === 'free' ? graftOf(form, p.graft) : null,
      start: p.plantedLongAgo ? -p.maturityYears : startOf(p.plantedOn), seed,
    }
  })
  const points = growth.plants.map((p) => ({ p, ...frame.to([p.lng, p.lat]) }))
  const patchStart = startOf(null)
  growth.patches.forEach((patch) => {
    const ring = patch.ring.map(frame.to)
    patch.lines.forEach((line, index) => {
      const already = points.filter(({ p, x, y }) => p.speciesId != null && p.speciesId === line.speciesId
        && p.varietyId === line.varietyId && insideRing(ring, x, y)).length
      scatter(ring, Math.max(0, line.shown - already), patch.id * 131 + index * 17).forEach((point, i) => {
        const [lng, lat] = frame.from(point)
        const seed = patch.id * 104_729 + index * 613 + i
        plants.push({
          lng, lat, look: lookOf(line, seed), strata: line.strata, heightM: line.heightM, spreadM: line.spreadM,
          maturityYears: line.maturityYears, training: 'free', graft: null, start: patchStart, seed,
        })
      })
    })
  })
  return plants
}

/** Share of a sprite's side its painted crown covers (the rest is a margin of paper). */
export const CROWN_SHARE = 0.9

export type PaintedPlant = {
  lng: number
  lat: number
  sprite: SpriteKey
  /** Crown diameter, metres. */
  diameter: number
  height: number
  /** Turn of the painting, degrees: no two crowns alike. */
  rotation: number
}

/** The garden `year` years after year 0, at the time of the year `f`: what to paint, lowest first. */
export function gardenAt(plants: GardenPlant[], year: number, f: number): PaintedPlant[] {
  const painted: PaintedPlant[] = []
  for (const plant of plants) {
    const size = sizeAt(plant, year - plant.start)
    if (!size) continue
    painted.push({
      lng: plant.lng, lat: plant.lat, sprite: spriteOf(plant.look, f, plant.seed),
      diameter: size.spread, height: size.height, rotation: (Math.abs(plant.seed) * 37) % 360,
    })
  }
  return painted.sort((a, b) => a.height - b.height)
}

/** The side of a sprite's painting, in pixels of its atlas. */
export function spriteSide(sprite: SpriteKey): number {
  return spriteRect(sprite).small ? SMALL_SPRITE : SPRITE
}

/** The painted garden as GeoJSON for MapLibre: `scale` is the icon size per pixel per metre. */
export function gardenGeoJson(painted: PaintedPlant[]): FeatureCollection<Point> {
  return {
    type: 'FeatureCollection',
    features: painted.map((p, i) => ({
      type: 'Feature',
      id: i,
      geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
      properties: { sprite: `garden-${p.sprite}`, scale: p.diameter / (spriteSide(p.sprite) * CROWN_SHARE), rotation: p.rotation, height: p.height },
    })),
  }
}

/** « Mon jardin dans 30 ans » (video.ts): 1 s at planting, 12 s of growth, 2 s on year 30. */
export const VIDEO_SECONDS = { still: 1, grow: 12, hold: 2 } as const
export const VIDEO_DURATION = VIDEO_SECONDS.still + VIDEO_SECONDS.grow + VIDEO_SECONDS.hold

/**
 * The year and the time of the year at `seconds` into the video. The years
 * ease in and out; the seasons turn slowly, two and a half times, so the
 * video ends on year 30 in summer.
 */
export function videoMoment(seconds: number): { year: number; f: number } {
  const p = Math.min(1, Math.max(0, (seconds - VIDEO_SECONDS.still) / VIDEO_SECONDS.grow))
  const eased = p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2
  return { year: eased * GARDEN_YEARS, f: (SEASONS.winter + p * (2 + SEASONS.summer - SEASONS.winter)) % 1 }
}
