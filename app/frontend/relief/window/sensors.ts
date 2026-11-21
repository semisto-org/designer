// The phone's sensors for « Fenêtre sur l'an 15 »: its back camera, its
// position and which way it looks. Each one asks the person once, in the
// gesture that opens the window (iOS refuses the motion sensors and the
// camera outside a tap), and says plainly when it is refused.

import { alphaFromCompass, deviceCameraPose, smoothed, type Pose } from './pose.ts'

export type SensorError = 'camera' | 'motion' | 'position' | 'unsupported'

type OrientationEventIOS = DeviceOrientationEvent & { webkitCompassHeading?: number; webkitCompassAccuracy?: number }
type OrientationPermission = { requestPermission?: () => Promise<'granted' | 'denied'> }

/** Asks for the motion sensors where the browser wants a yes (iOS 13 and later). */
export async function askMotion(): Promise<boolean> {
  const request = (window.DeviceOrientationEvent as unknown as OrientationPermission | undefined)?.requestPermission
  if (typeof request !== 'function') return 'DeviceOrientationEvent' in window
  try {
    return (await request()) === 'granted'
  } catch {
    return false
  }
}

/** The back camera's stream, or null when refused or absent. */
export async function openCamera(): Promise<MediaStream | null> {
  if (!navigator.mediaDevices?.getUserMedia) return null
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
    })
  } catch {
    return null
  }
}

export type Heading = {
  pose: Pose
  /** Whether north comes from a real compass (false: an arbitrary start, to be set by hand). */
  absolute: boolean
  /** Degrees of uncertainty the phone gives for its compass, when it does. */
  accuracy: number | null
}

/**
 * Follows where the back camera looks. Android's « absolute » events carry
 * north; iOS gives its compass apart (webkitCompassHeading); a browser that
 * has neither still turns with the phone, from an arbitrary north the
 * person then corrects. Returns the function that stops listening.
 */
export function watchHeading(onChange: (heading: Heading) => void): () => void {
  let last: Pose | null = null
  let sawAbsolute = false
  const screenAngle = () => (screen.orientation?.angle ?? (window as unknown as { orientation?: number }).orientation ?? 0) as number
  const handle = (event: OrientationEventIOS, absoluteEvent: boolean) => {
    if (event.beta == null || event.gamma == null) return
    let alpha = event.alpha ?? 0
    let absolute = absoluteEvent || event.absolute === true
    const compass = event.webkitCompassHeading
    if (typeof compass === 'number' && compass >= 0) {
      // iOS: its compass is the heading of the device's own frame, like alpha.
      alpha = alphaFromCompass(compass)
      absolute = true
    }
    if (absoluteEvent) sawAbsolute = true
    else if (sawAbsolute && !compass) return
    last = smoothed(last, deviceCameraPose(alpha, event.beta, event.gamma, screenAngle()))
    const accuracy = typeof event.webkitCompassAccuracy === 'number' && event.webkitCompassAccuracy >= 0 ? event.webkitCompassAccuracy : null
    onChange({ pose: last, absolute, accuracy })
  }
  const onAbsolute = (event: Event) => handle(event as OrientationEventIOS, true)
  const onRelative = (event: Event) => handle(event as OrientationEventIOS, false)
  window.addEventListener('deviceorientationabsolute', onAbsolute)
  window.addEventListener('deviceorientation', onRelative)
  return () => {
    window.removeEventListener('deviceorientationabsolute', onAbsolute)
    window.removeEventListener('deviceorientation', onRelative)
  }
}

export type Position = { lng: number; lat: number; accuracy: number }

/** Follows the phone's position; `onError` once if it is refused. Returns the function that stops. */
export function watchPosition(onChange: (position: Position) => void, onError: () => void): () => void {
  if (!('geolocation' in navigator)) {
    onError()
    return () => {}
  }
  const id = navigator.geolocation.watchPosition(
    (p) => onChange({ lng: p.coords.longitude, lat: p.coords.latitude, accuracy: p.coords.accuracy }),
    (error) => { if (error.code === error.PERMISSION_DENIED) onError() },
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
  )
  return () => navigator.geolocation.clearWatch(id)
}
