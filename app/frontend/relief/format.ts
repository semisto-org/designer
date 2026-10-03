// Ported from Claudy (MIT, © 2022-2023 Fondation Les 4 Sources) — the small
// number formatters of `map_relief_controller.js` (French conventions).

export function formatNumber(value: number, digits = 0): string {
  return Number(value).toLocaleString('fr-BE', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

export function formatVolume(m3: number): string {
  if (Math.abs(m3) < 10) return `${formatNumber(m3, 1)} m³`
  return `${formatNumber(m3)} m³`
}

export function formatDepth(meters: number): string {
  if (meters < 0.01) return `${formatNumber(meters * 1000)} mm`
  if (meters < 1) return `${formatNumber(meters * 100)} cm`
  return `${formatNumber(meters, 2)} m`
}

export function formatSurface(m2: number): string {
  if (m2 < 10000) return `${formatNumber(m2)} m²`
  return `${formatNumber(m2 / 10000, 1)} ha`
}

/** Simulated time: "12 min 05", then "1 h 05". */
export function formatDuration(seconds: number): string {
  const total = Math.floor(seconds)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return h > 0 ? `${h} h ${String(m).padStart(2, '0')}` : `${m} min ${String(s).padStart(2, '0')}`
}

export function formatMinutes(minutes: number): string {
  return minutes >= 60 ? `${formatNumber(minutes / 60, minutes % 60 ? 1 : 0)} h` : `${minutes} min`
}

/** Hours of sun, to the quarter: "6 h 15". */
export function formatHours(hours: number): string {
  const total = Math.round(hours * 4) * 15
  const h = Math.floor(total / 60)
  const m = total % 60
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`
}

/** Minutes after local midnight as a clock time: "14 h 05". */
export function formatClock(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  return `${h} h ${String(m).padStart(2, '0')}`
}
