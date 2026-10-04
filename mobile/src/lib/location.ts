// The phone's position, asked once and reused for a few seconds.
import * as Location from 'expo-location'
import type { Position } from './types'

export async function locationAllowed(): Promise<boolean> {
  const current = await Location.getForegroundPermissionsAsync()
  if (current.granted) return true
  if (!current.canAskAgain) return false
  return (await Location.requestForegroundPermissionsAsync()).granted
}

/** Where the phone is now (≤ 10 s old), or null without permission or fix. */
export async function currentPosition(): Promise<Position | null> {
  if (!(await locationAllowed())) return null
  try {
    const recent = await Location.getLastKnownPositionAsync({ maxAge: 10_000, requiredAccuracy: 30 })
    const fix = recent ?? (await Location.getCurrentPositionAsync({ accuracy: Location.LocationAccuracy.High }))
    return [fix.coords.longitude, fix.coords.latitude]
  } catch {
    return null
  }
}

/** A fresh fix with its accuracy in meters, for placing something where one stands. */
export async function currentPositionWithAccuracy(): Promise<{ position: Position; accuracy: number | null } | null> {
  if (!(await locationAllowed())) return null
  try {
    const fix = await Location.getCurrentPositionAsync({ accuracy: Location.LocationAccuracy.Highest })
    return { position: [fix.coords.longitude, fix.coords.latitude], accuracy: fix.coords.accuracy }
  } catch {
    return null
  }
}
