// Pure helpers (no MapLibre, no aliases): tested with node:test in
// test/frontend/gps/.
//
// A point placed from the phone keeps the accuracy of its GPS fix
// (`gps_accuracy_m`, see app/models/concerns/gps_fix.rb). Beyond
// GPS_CHECK_ABOVE_M it is flagged until it is moved by hand or said to be
// well placed (`gps_checked`).

export const GPS_CHECK_ABOVE_M = 10

type Properties = Record<string, unknown>

/** The fix's accuracy in meters, or null for a point not placed by GPS. */
export function gpsAccuracy(properties: Properties): number | null {
  const value = properties.gps_accuracy_m
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
}

/** Whether the point should be checked: an imprecise fix nobody looked at yet. */
export function gpsToCheck(properties: Properties): boolean {
  const accuracy = gpsAccuracy(properties)
  return accuracy != null && accuracy > GPS_CHECK_ABOVE_M && properties.gps_checked !== true
}
