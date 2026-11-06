// Soil sampling points in the field: which one is closest, which still has no photo.
import { distance } from './geo'
import type { Photo, Position, SoilSample } from './types'

/** Meters from here to the point, or null when either has no place. */
export function metersTo(here: Position | null, sample: SoilSample): number | null {
  return here && sample.lng != null && sample.lat != null ? distance(here, [sample.lng, sample.lat]) : null
}

/** Points nearest first when the phone knows where it is (unplaced last), else in the website's order. */
export function nearestFirst(samples: SoilSample[], here: Position | null): SoilSample[] {
  if (!here) return samples
  const away = (sample: SoilSample) => metersTo(here, sample) ?? Infinity
  return [...samples].sort((a, b) => away(a) - away(b))
}

/** The photos of one point among the map's photos. */
export function photosOf(photos: Photo[], sample: SoilSample): Photo[] {
  return photos.filter((photo) => photo.soilSampleId === sample.id)
}
