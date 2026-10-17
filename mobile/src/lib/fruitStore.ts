// Readings of a fruit store (cellar, cold room…): temperature and humidity
// noted on the phone, sent through the outbox, and what the server's
// verdict means (same rules as the web editor's map/storage/advice.ts).
export type ClimateStatus = 'good' | 'fair' | 'bad' | 'frost'
export type StorageVerdict = {
  temperature: { status: ClimateStatus; side: 'warm' | 'cold' | null } | null
  humidity: { status: ClimateStatus; side: 'dry' | 'wet' | null } | null
  overall: ClimateStatus | null
}

export type NewStorageReading = {
  measuredOn: string
  temperatureC: number | null
  temperatureMinC: number | null
  temperatureMaxC: number | null
  humidityPct: number | null
  note: string | null
}

export const isFruitStore = (kind: string) => kind === 'fruit_store'

/** A typed number (« 18,5 », « 72 ») or null when the field is empty or not a number. */
export function parseMeasure(value: string): number | null {
  const text = value.trim().replace(',', '.')
  if (text === '') return null
  const n = Number(text)
  return Number.isFinite(n) ? n : null
}

export const measuresSomething = (r: NewStorageReading) =>
  [r.temperatureC, r.temperatureMinC, r.temperatureMaxC, r.humidityPct].some((v) => v !== null)

export function storageReadingBody(r: NewStorageReading) {
  return {
    storage_reading: {
      measured_on: r.measuredOn, temperature_c: r.temperatureC, temperature_min_c: r.temperatureMinC,
      temperature_max_c: r.temperatureMaxC, humidity_pct: r.humidityPct, note: r.note,
    },
  }
}

/** Keys under storage_readings.advice for the latest verdict. */
export function storageAdvice(verdict: StorageVerdict | null | undefined): string[] {
  if (!verdict) return []
  const keys: string[] = []
  const { temperature, humidity } = verdict
  if (temperature?.status === 'frost') keys.push('frost')
  else if (temperature?.side === 'warm') keys.push(temperature.status === 'bad' ? 'warm_bad' : 'warm_fair')
  if (humidity?.side === 'dry') keys.push(humidity.status === 'bad' ? 'dry_bad' : 'dry_fair')
  else if (humidity?.side === 'wet') keys.push('wet')
  return keys
}
