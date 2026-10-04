// Walking a hedge, a path or a boundary: GPS fixes are recorded by a
// background location task (keeps going with the screen off) into
// trace.json, then cleaned into a line or a polygon.
import * as Location from 'expo-location'
import * as TaskManager from 'expo-task-manager'
import { cleanTrace } from './geo'
import { t } from './i18n'
import { readJson, removeFile, writeJson } from './storage'
import type { Position } from './types'

const TASK = 'designer-trace'
const FILE = 'trace.json'

export type Fix = { position: Position; accuracy: number | null; at: number }
type TraceFile = { mapId: number; startedAt: number; fixes: Fix[] }

const listeners = new Set<(fixes: Fix[]) => void>()

// Must be defined when the JS bundle loads (imported from the root layout).
TaskManager.defineTask<{ locations: Location.LocationObject[] }>(TASK, async ({ data, error }) => {
  if (error || !data) return
  const trace = readJson<TraceFile>(FILE)
  if (!trace) return
  for (const location of data.locations) {
    trace.fixes.push({ position: [location.coords.longitude, location.coords.latitude], accuracy: location.coords.accuracy, at: location.timestamp })
  }
  writeJson(FILE, trace)
  listeners.forEach((listener) => listener(trace.fixes))
})

export function onFixes(listener: (fixes: Fix[]) => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function currentTrace(): TraceFile | null {
  return readJson<TraceFile>(FILE)
}

export type StartResult = 'started' | 'no_permission'

export async function startTrace(mapId: number): Promise<StartResult> {
  const foreground = await Location.requestForegroundPermissionsAsync()
  if (!foreground.granted) return 'no_permission'
  // Background is a bonus (screen off); without it the trace still records while the app is open.
  await Location.requestBackgroundPermissionsAsync().catch(() => undefined)
  writeJson(FILE, { mapId, startedAt: Date.now(), fixes: [] } satisfies TraceFile)
  await Location.startLocationUpdatesAsync(TASK, {
    accuracy: Location.LocationAccuracy.BestForNavigation,
    distanceInterval: 2,
    activityType: Location.LocationActivityType.Fitness,
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: true,
    foregroundService: { notificationTitle: t('mobile.trace.notification_title'), notificationBody: t('mobile.trace.notification_body'), notificationColor: '#5B5781' },
  })
  return 'started'
}

/** Stops recording; returns the cleaned points (empty when cancelled). */
export async function stopTrace({ keep = true } = {}): Promise<Position[]> {
  if (await Location.hasStartedLocationUpdatesAsync(TASK).catch(() => false)) await Location.stopLocationUpdatesAsync(TASK)
  const trace = readJson<TraceFile>(FILE)
  removeFile(FILE)
  return keep && trace ? cleanTrace(trace.fixes) : []
}
