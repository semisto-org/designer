/**
 * Whether the photo markers are shown on a map: a choice per viewer and per
 * map, kept in localStorage. Maps opened before the choice was per map fall
 * back on the old choice made for every map.
 */
export const shownKey = (mapId: number) => `designer:map:${mapId}:photos-shown`
export const LEGACY_SHOWN_KEY = 'designer.photos.showOnMap'

type Storage = Pick<globalThis.Storage, 'getItem'>

export function readPhotosShown(storage: Storage | null, mapId: number): boolean {
  if (!storage) return true
  try {
    const value = storage.getItem(shownKey(mapId)) ?? storage.getItem(LEGACY_SHOWN_KEY)
    return value !== 'false'
  } catch {
    return true
  }
}

/** The markers stay on the map while a photo is being placed: one sees where it lands. */
export function photoMarkersVisible(state: { showOnMap: boolean; placingId: number | null }): boolean {
  return state.showOnMap || state.placingId != null
}
