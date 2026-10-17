import type { StorageVerdict } from '@/types/storage'

/**
 * What to do about a store's latest reading, as keys under
 * storage_readings.advice (same rules as the phone app's storage.ts).
 */
export function storageAdvice(verdict: StorageVerdict | null | undefined): string[] {
  if (!verdict) return []
  const keys: string[] = []
  const temperature = verdict.temperature
  const humidity = verdict.humidity
  if (temperature?.status === 'frost') keys.push('frost')
  else if (temperature?.side === 'warm') keys.push(temperature.status === 'bad' ? 'warm_bad' : 'warm_fair')
  if (humidity?.side === 'dry') keys.push(humidity.status === 'bad' ? 'dry_bad' : 'dry_fair')
  else if (humidity?.side === 'wet') keys.push('wet')
  return keys
}
