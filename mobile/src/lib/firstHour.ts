// « Ta première heure »: the three things to go and see outside (where the
// water goes after rain, a sign of the season, three wild plants), as the
// server read them (Maps::FirstHourMissions), ticked at once on the phone
// when a downpour or a sign is noted here, before the next sync. Pure logic,
// unit-tested.
import type { FirstHour, FirstHourMission, MapFeature } from './types'

export const WATER_SIGNS = ['puddle', 'waterlogged']

const counted = (feature: MapFeature) => feature.properties.status !== 'draft' && feature.properties.status !== 'rejected'

/** The missions with what the phone knows on top: the features noted since the last sync. */
export function firstHourMissions(firstHour: FirstHour | null | undefined, features: MapFeature[]): FirstHour | null {
  if (!firstHour || !firstHour.shown) return null
  let water = 0
  let season = 0
  for (const feature of features) {
    if (!counted(feature)) continue
    const { kind, sign } = feature.properties
    if (kind === 'storm_observation') water++
    else if (kind === 'season_sign') {
      if (typeof sign === 'string' && WATER_SIGNS.includes(sign)) water++
      else season++
    }
  }
  const local: Record<string, number> = { water, season }
  const missions = firstHour.missions.map((mission): FirstHourMission => {
    const count = Math.max(mission.count, local[mission.key] ?? 0)
    return { ...mission, count, done: mission.done || (mission.key !== 'living' && count > 0) }
  })
  return { ...firstHour, missions, done: missions.every((m) => m.done) }
}
