import { useEffect, useMemo, useState } from 'react'
import { api } from '@/lib/api'
import { usePhotos } from '@/map/photos/store'
import type { MapPhotoData } from '@/types/soil_photos'

/**
 * The photos linked to one feature (its cover photo first, then newest
 * first), reloaded when photos change on the map. Null while loading.
 */
export function useLinkedPhotos(mapId: number, featureId: number, coverId: number | null = null): MapPhotoData[] | null {
  const { version, mapId: photosMapId } = usePhotos()
  const [state, setState] = useState<{ key: string; photos: MapPhotoData[] } | null>(null)
  const key = `${mapId}:${featureId}`

  useEffect(() => {
    let cancelled = false
    api<{ photos: MapPhotoData[] }>(`/maps/${mapId}/photos?feature_id=${featureId}&linked=1`)
      .then((data) => !cancelled && setState({ key, photos: data.photos }))
      .catch(() => !cancelled && setState({ key, photos: [] }))
    return () => { cancelled = true }
  }, [mapId, featureId, key, version, photosMapId])

  const photos = state?.key === key ? state.photos : null
  // The server sorts too; this keeps the order right the moment the cover changes.
  return useMemo(() => photos && withCoverFirst(photos, coverId), [photos, coverId])
}

export function withCoverFirst(photos: MapPhotoData[], coverId: number | null): MapPhotoData[] {
  const cover = coverId == null ? undefined : photos.find((p) => p.id === coverId)
  return cover ? [cover, ...photos.filter((p) => p !== cover)] : photos
}
