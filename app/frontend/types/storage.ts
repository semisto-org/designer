/** Readings of a fruit store (StorageReading, StorageClimate). */
export type ClimateStatus = 'good' | 'fair' | 'bad' | 'frost'

export type StorageVerdict = {
  temperature: { status: ClimateStatus; side: 'warm' | 'cold' | null } | null
  humidity: { status: ClimateStatus; side: 'dry' | 'wet' | null } | null
  overall: ClimateStatus | null
}

export type StorageReading = {
  id: number
  featureId: number
  measuredOn: string
  temperatureC: number | null
  temperatureMinC: number | null
  temperatureMaxC: number | null
  humidityPct: number | null
  note: string | null
  author: string | null
  verdict: StorageVerdict
}

export type StorageSummary = {
  readings: number
  latest: { measuredOn: string; verdict: StorageVerdict } | null
  winterReadings: number
  winterLowC: number | null
  winterHighC: number | null
}

export type StorageRanges = {
  temperatureC: { good: [number, number]; fair: [number, number]; frost: number }
  humidityPct: { good: [number, number]; fair: [number, number] }
}

export type StorageReadingsData = {
  readings: StorageReading[]
  summary: StorageSummary
  ranges: StorageRanges
  otherStores: number
}
