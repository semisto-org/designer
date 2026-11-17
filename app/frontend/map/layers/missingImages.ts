import type { Map as MapLibreMap } from 'maplibre-gl'

type Resolve = (id: string) => void

const resolvers = new WeakMap<MapLibreMap, Set<Resolve>>()

/**
 * Lets a module draw an image the moment the style first asks for it.
 * MapLibre keeps a single missing-image resolver per map (the
 * `styleimagemissing` event comes too late for the tile being drawn): this
 * shares it, asking each module in turn until one has added the image.
 * Returns a function that withdraws `resolve`.
 */
export function resolveMissingImages(map: MapLibreMap, resolve: Resolve): () => void {
  let set = resolvers.get(map)
  if (!set) {
    const shared = new Set<Resolve>()
    set = shared
    resolvers.set(map, shared)
    map.setMissingStyleImageResolver((id) => {
      for (const each of shared) {
        if (map.hasImage(id)) return
        each(id)
      }
    })
  }
  set.add(resolve)
  return () => { resolvers.get(map)?.delete(resolve) }
}
