import type { RegionLayerData } from '@/types'

/** How far past the photo's last level the map may go before we say so. */
export const OVERZOOM_MARGIN = 0.4

/**
 * The deepest zoom at which the chosen base map is still a real photo, or
 * null when the base is not an aerial photo (a plan) or has no known limit.
 */
export function photoMaxZoom(layers: RegionLayerData[], base: string | null): number | null {
  const layer = layers.find((l) => l.key === base && l.category === 'base')
  if (!layer || layer.group !== 'photos' || layer.maxZoom == null) return null
  return layer.maxZoom
}

/** True once the map shows the photo enlarged past what it holds (blurry). */
export function pastPhotoLimit(zoom: number, maxZoom: number | null): boolean {
  return maxZoom != null && zoom > maxZoom + OVERZOOM_MARGIN
}
