import type { Map as MapLibreMap } from 'maplibre-gl'

export const STATION_LAYER = 'weather-stations-icon'
export const WEATHER_STATION_LAYER_IDS = [
  'weather-stations-link-casing', 'weather-stations-link-line', 'weather-stations-halo', STATION_LAYER, 'weather-stations-label',
] as const

/** The stations' names: « Noms sur la carte » off takes them away too (shown on hover, LabelPeek). */
export const WEATHER_STATION_NAME_LAYER = 'weather-stations-label'

export function setWeatherStationLayersVisible(map: Pick<MapLibreMap, 'getLayer' | 'setLayoutProperty'>, visible: boolean, labelsHidden = false) {
  WEATHER_STATION_LAYER_IDS.forEach((id) => {
    const shown = visible && !(labelsHidden && id === WEATHER_STATION_NAME_LAYER)
    if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', shown ? 'visible' : 'none')
  })
}
