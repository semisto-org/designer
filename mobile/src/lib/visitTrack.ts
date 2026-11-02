// The track of a site visit: where the person walked, recorded by its own
// background location task (screen off, phone in a pocket) into
// visit-track.json, apart from the trace of a hedge or a path (trace.ts),
// which can run during the visit too. Paused, then resumed, it goes on in
// the same file; it ends with the visit and is sent with it, cleaned.
import * as Location from 'expo-location'
import * as TaskManager from 'expo-task-manager'
import { cleanTrace, lineLength } from './geo'
import { t } from './i18n'
import { readJson, removeFile, writeJson } from './storage'
import type { Fix } from './trace'
import type { Position } from './types'

const TASK = 'designer-visit-track'
const FILE = 'visit-track.json'
// A walk is not a hedge: a fix every few metres is plenty, and spares the battery.
const STEP_M = 4

type TrackFile = { mapId: number; key: string; fixes: Fix[] }

const listeners = new Set<() => void>()
const notify = () => listeners.forEach((listener) => listener())

// Must be defined when the JS bundle loads (imported from the root layout).
TaskManager.defineTask<{ locations: Location.LocationObject[] }>(TASK, async ({ data, error }) => {
  if (error || !data) return
  const track = readJson<TrackFile>(FILE)
  // No track on file (the visit ended, or the app was reinstalled): stop the GPS.
  if (!track) {
    await Location.stopLocationUpdatesAsync(TASK).catch(() => undefined)
    return
  }
  for (const location of data.locations) {
    track.fixes.push({ position: [location.coords.longitude, location.coords.latitude], accuracy: location.coords.accuracy, at: location.timestamp })
  }
  writeJson(FILE, track)
  notify()
})

const running = () => Location.hasStartedLocationUpdatesAsync(TASK).catch(() => false)

export const visitTrack = {
  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => { listeners.delete(listener) }
  },

  /** How far the walk has gone so far, in metres (the cleaned track). */
  meters(key: string): number {
    const track = readJson<TrackFile>(FILE)
    return track && track.key === key ? lineLength(cleanTrace(track.fixes, { maxAccuracy: 25, minStep: STEP_M })) : 0
  },

  /** Starts or resumes the track of this visit. */
  async start(mapId: number, key: string): Promise<'started' | 'no_permission'> {
    const foreground = await Location.requestForegroundPermissionsAsync()
    if (!foreground.granted) return 'no_permission'
    // Background is a bonus (screen off); without it the track still records while the app is open.
    await Location.requestBackgroundPermissionsAsync().catch(() => undefined)
    const kept = readJson<TrackFile>(FILE)
    if (!kept || kept.key !== key) writeJson(FILE, { mapId, key, fixes: [] } satisfies TrackFile)
    if (!(await running())) {
      await Location.startLocationUpdatesAsync(TASK, {
        accuracy: Location.LocationAccuracy.High,
        distanceInterval: STEP_M,
        activityType: Location.LocationActivityType.Fitness,
        pausesUpdatesAutomatically: false,
        showsBackgroundLocationIndicator: true,
        foregroundService: { notificationTitle: t('mobile.visit.record.notification_title'), notificationBody: t('mobile.visit.record.notification_body'), notificationColor: '#5B5781' },
      })
    }
    notify()
    return 'started'
  },

  /** Pauses the GPS; the fixes so far stay for the end of the visit. */
  async pause() {
    if (await running()) await Location.stopLocationUpdatesAsync(TASK)
    notify()
  },

  /** Ends the track: the cleaned points of this visit (none for another visit's file). */
  async finish(key: string): Promise<Position[]> {
    await visitTrack.pause()
    const track = readJson<TrackFile>(FILE)
    removeFile(FILE)
    notify()
    if (!track || track.key !== key) return []
    const points = cleanTrace(track.fixes, { maxAccuracy: 25, minStep: STEP_M })
    return points.length >= 2 ? points : []
  },
}
