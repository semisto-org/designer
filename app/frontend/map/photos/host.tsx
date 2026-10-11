import { createContext, useContext } from 'react'
import type { MapPhotoData } from '@/types/soil_photos'

/**
 * What the photo lightbox and the before/after slider need from the screen
 * that hosts them: the map editor (with a map to fly to and place on) or the
 * full-page « Photos » view (which sends the person to the map instead).
 */
export type PhotoHost = {
  mapId: number
  canEdit: boolean
  notify: (message: string, tone?: 'info' | 'error') => void
  /** Shows the photo's spot on the map. */
  locate: (photo: MapPhotoData) => void
  /** Lets the person place (or move) the photo with a click on the map. */
  place: (photo: MapPhotoData) => void
}

export const PhotoHostContext = createContext<PhotoHost | null>(null)

export function usePhotoHost(): PhotoHost {
  const host = useContext(PhotoHostContext)
  if (!host) throw new Error('usePhotoHost outside a PhotoHostContext')
  return host
}
