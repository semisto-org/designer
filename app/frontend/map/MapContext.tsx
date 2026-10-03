import { createContext, useContext } from 'react'
import type { Map as MapLibreMap } from 'maplibre-gl'

// The MapLibre instance, shared with panels and tools once the style loaded.
export const MapContext = createContext<MapLibreMap | null>(null)

export function useMapInstance() {
  return useContext(MapContext)
}
