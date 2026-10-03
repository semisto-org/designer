import { Head, Link } from '@inertiajs/react'
import { ArrowLeft } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Flash } from '@/components/ui/Flash'
import { formatArea, t } from '@/lib/i18n'
import { MapView } from '@/map/MapView'
import { useMapInstance } from '@/map/MapContext'
import { installBoundary } from '@/map/layers/boundary'
import { installFeatureLayers } from '@/map/layers/features'
import type { EntitlementsData, MapData, MapFeature, RegionLayerData } from '@/types'

type Props = {
  map: MapData
  layers: RegionLayerData[]
  features: MapFeature[]
  mapEntitlements: EntitlementsData
}

/** The map editor: full-screen map, top bar, side panel. */
export default function MapShow({ map, features }: Props) {
  const [items] = useState<MapFeature[]>(features)
  return (
    <div className="flex h-dvh flex-col bg-loam-100">
      <Head title={map.name} />
      <Flash />
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-loam-200 bg-white px-3">
        <Link href="/maps" className="rounded-md p-1.5 text-loam-500 hover:bg-loam-100" aria-label={t('maps.show.back')}>
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h1 className="truncate text-base">{map.name}</h1>
        <span className="text-sm text-loam-400">{formatArea(map.areaM2)}</span>
      </header>
      <div className="relative flex-1">
        <MapView center={map.center ?? map.region.center} zoom={map.zoom ?? (map.center ? 17 : map.region.defaultZoom)} bbox={map.bbox}>
          <MapContent map={map} features={items} />
        </MapView>
      </div>
    </div>
  )
}

function MapContent({ map, features }: { map: MapData; features: MapFeature[] }) {
  const instance = useMapInstance()
  useEffect(() => {
    if (!instance) return
    installBoundary(instance, map.boundary)
    installFeatureLayers(instance, { type: 'FeatureCollection', features })
  }, [instance, map.boundary, features])
  return null
}
