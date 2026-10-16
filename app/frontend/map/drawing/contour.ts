import type { LineString } from 'geojson'
import { api } from '@/lib/api'
import type { ReliefOverview } from '@/types/relief'

/** GET /maps/:id/relief/contour — the contour line through a point. */
export type ContourResult = {
  geometry: LineString
  elevationM: number
  lengthM: number
  closed: boolean
}

const ready = new Set<number>()

/** Whether the map's relief is downloaded, so a line can follow a contour. */
export async function reliefReady(mapId: number): Promise<boolean> {
  if (ready.has(mapId)) return true
  try {
    const overview = await api<ReliefOverview>(`/maps/${mapId}/terrain`)
    if (overview.terrain?.status === 'ready') ready.add(mapId)
  } catch {
    // Not on the plan, or offline: the toolbar simply offers freehand drawing.
  }
  return ready.has(mapId)
}

export function traceContour(mapId: number, [lng, lat]: number[]): Promise<ContourResult> {
  return api<ContourResult>(`/maps/${mapId}/relief/contour?lng=${lng}&lat=${lat}`)
}
