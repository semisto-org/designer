import type { Map as MapLibreMap } from 'maplibre-gl'

const NOT_LOADED = 'Style is not done loading.'

/**
 * Runs `fn` now, or once the style accepts sources, layers and images
 * again. `isStyleLoaded()` is also false while tiles or crowns load, and
 * `load` fires only once: a change made then would wait forever. The style
 * is missing for a moment when the browser takes the WebGL context back
 * (Safari does when a tab is left and reopened), then reloads from scratch.
 * Any other error is a real one and is thrown. Returns a cancel, for an
 * effect's cleanup: a retry must not reinstall what the effect took away.
 */
export function whenStyleReady(map: MapLibreMap, fn: () => void): () => void {
  let cancelled = false
  const run = () => {
    if (cancelled) return
    if (!map.style) {
      map.once('idle', run)
      return
    }
    try {
      fn()
    } catch (error) {
      if (map.style && !(error instanceof Error && error.message === NOT_LOADED)) throw error
      map.once('idle', run)
    }
  }
  run()
  return () => {
    cancelled = true
    map.off('idle', run)
  }
}
