// What the terrain screen says about the place around the person: what
// grows near them and where, how long a plant has been in the ground, and
// what this month asks of a forest garden. Pure, so it is tested.
import seasons from '../i18n/seasons.json'
import { anchor, bearing, distance } from './geo'
import { t } from './i18n'
import type { MapFeature, Position } from './types'

export const DIRECTIONS = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'] as const
export type Direction = (typeof DIRECTIONS)[number]

export const compass = (deg: number): Direction => DIRECTIONS[Math.round(deg / 45) % 8]

export type Nearby = { feature: MapFeature; meters: number; direction: Direction }

/** Where a feature stands from the person: meters and compass direction. */
export function whereFrom(me: Position, feature: MapFeature): { meters: number; direction: Direction } {
  const point = anchor(feature.geometry)
  return { meters: distance(me, point), direction: compass(bearing(me, point)) }
}

/**
 * The features around the person, nearest first: within `radius` meters,
 * at most `limit`. Areas count by their centre, so a big zone one stands
 * in may be left out: what matters around oneself is what one can reach.
 */
export function around(features: MapFeature[], me: Position, { radius = 30, limit = 30 } = {}): Nearby[] {
  return features
    .filter((feature) => feature.properties.status !== 'rejected')
    .map((feature) => ({ feature, ...whereFrom(me, feature) }))
    .filter((item) => item.meters <= radius)
    .sort((a, b) => a.meters - b.meters)
    .slice(0, limit)
}

export type Age =
  | { unit: 'today' }
  | { unit: 'days' | 'months' | 'winters'; count: number }

/**
 * How long a plant has been in the ground, the way gardeners count it:
 * days, then months, then the winters it went through (one per 15 January
 * since planting, the heart of winter).
 */
export function plantedAge(plantedOn: string | null | undefined, now = new Date()): Age | null {
  if (!plantedOn || !/^\d{4}-\d{2}-\d{2}/.test(plantedOn)) return null
  const [y, m, d] = plantedOn.slice(0, 10).split('-').map(Number)
  const planted = new Date(y, m - 1, d)
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const days = Math.round((today.getTime() - planted.getTime()) / 86_400_000)
  if (days <= 0) return { unit: 'today' }
  let winters = 0
  for (let year = planted.getFullYear(); year <= today.getFullYear(); year++) {
    const heart = new Date(year, 0, 15)
    if (heart > planted && heart <= today) winters++
  }
  if (winters > 0) return { unit: 'winters', count: winters }
  if (days < 31) return { unit: 'days', count: days }
  const months = (today.getFullYear() - planted.getFullYear()) * 12 + today.getMonth() - planted.getMonth() - (today.getDate() < planted.getDate() ? 1 : 0)
  return { unit: 'months', count: Math.max(1, months) }
}

/** « a passé 2 hivers ici », « planté il y a 3 mois ». */
export function ageLabel(age: Age): string {
  return age.unit === 'today' ? t('mobile.terrain.age.today') : t(`mobile.terrain.age.${age.unit}`, { count: age.count })
}

/** The month's card of the help center: what a forest garden asks for now. */
export function monthCard(now = new Date()): { title: string; body: string } | null {
  return (seasons as Record<string, { title: string; body: string }>)[String(now.getMonth() + 1)] ?? null
}
