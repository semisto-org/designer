import type { MapGeoJSONFeature, MapMouseEvent } from 'maplibre-gl'
import { useEffect, useMemo, useState } from 'react'
import { api } from '@/lib/api'
import { useEditor } from '@/map/editor/EditorContext'
import {
  installWeatherStationLayers, linkToNearest, removeWeatherStationLayers, setWeatherStationLayersVisible, STATION_LAYER,
} from '@/map/weather_stations/layers'
import { useWeatherStations, weatherStationsActions } from '@/map/weather_stations/store'
import type { StationsGeoJSON } from '@/types/weather_stations'

/**
 * Always mounted in the editor: once the user asks to see the weather
 * stations (« Climat » panel), loads them and draws them on the map, the
 * nearest one in plum with a pencilled line to the terrain. Clicking a
 * station opens the « Climat » panel on its observations.
 */
export default function WeatherStationsOverlay() {
  const editor = useEditor()
  const map = editor.instance
  const { showOnMap } = useWeatherStations()
  const [stations, setStations] = useState<StationsGeoJSON | null>(null)
  const center = editor.map.center
  const centerKey = center ? center.join(',') : ''

  useEffect(() => { weatherStationsActions.reset() }, [editor.map.id])

  // Load once shown, again when the terrain moves (the nearest station changes).
  useEffect(() => {
    if (!showOnMap) return
    const controller = new AbortController()
    api<StationsGeoJSON>(`/maps/${editor.map.id}/weather_stations/stations`, { signal: controller.signal })
      .then(setStations)
      .catch(() => { /* The section says why; the map just stays without stations. */ })
    return () => controller.abort()
  }, [editor.map.id, showOnMap, centerKey])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const link = useMemo(() => linkToNearest(center, stations), [centerKey, stations])

  useEffect(() => {
    if (!stations?.available) return
    const timer = window.setTimeout(() => {
      installWeatherStationLayers(map, stations, link)
      setWeatherStationLayersVisible(map, showOnMap)
    }, 0)
    return () => window.clearTimeout(timer)
  }, [map, stations, link, showOnMap])
  useEffect(() => () => removeWeatherStationLayers(map), [map])

  useEffect(() => {
    const onClick = (event: MapMouseEvent & { features?: MapGeoJSONFeature[] }) => {
      if (editor.drawing) return
      const code = event.features?.[0]?.properties?.code
      if (code == null) return
      weatherStationsActions.focus(Number(code))
      editor.openPanel('climate')
    }
    const pointer = () => { map.getCanvas().style.cursor = 'pointer' }
    const reset = () => { map.getCanvas().style.cursor = '' }
    map.on('click', STATION_LAYER, onClick)
    map.on('mouseenter', STATION_LAYER, pointer)
    map.on('mouseleave', STATION_LAYER, reset)
    return () => {
      map.off('click', STATION_LAYER, onClick)
      map.off('mouseenter', STATION_LAYER, pointer)
      map.off('mouseleave', STATION_LAYER, reset)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, editor.drawing])

  return null
}
