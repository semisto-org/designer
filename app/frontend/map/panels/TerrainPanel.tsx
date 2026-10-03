import { PenLine } from 'lucide-react'
import { useState } from 'react'
import type { MultiPolygon, Polygon } from 'geojson'
import { Button } from '@/components/ui/Button'
import { api } from '@/lib/api'
import { formatArea, t } from '@/lib/i18n'
import { useEditor } from '@/map/editor/EditorContext'
import type { MapData } from '@/types'

/** The terrain outline: draw it (parcel lookup comes from the cadastre panel). */
export default function TerrainPanel() {
  const editor = useEditor()
  const [busy, setBusy] = useState(false)

  async function drawBoundary() {
    const geometry = await editor.draw('polygon')
    if (!geometry) return
    setBusy(true)
    try {
      const multi: MultiPolygon = geometry.type === 'Polygon'
        ? { type: 'MultiPolygon', coordinates: [(geometry as Polygon).coordinates] }
        : (geometry as MultiPolygon)
      const { map } = await api<{ map: MapData }>(`/maps/${editor.map.id}`, {
        method: 'PATCH',
        body: { map: { boundary: multi } },
      })
      editor.setMap(map)
      editor.notify(t('editor.terrain.saved'))
    } catch (error) {
      editor.notify((error as Error).message, 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-loam-600">{t('editor.terrain.intro')}</p>
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-lg bg-loam-50 p-3">
          <dt className="text-xs text-loam-500">{t('maps.area')}</dt>
          <dd className="font-medium">{formatArea(editor.map.areaM2)}</dd>
        </div>
        <div className="rounded-lg bg-loam-50 p-3">
          <dt className="text-xs text-loam-500">{t('editor.terrain.parcels')}</dt>
          <dd className="font-medium">{editor.map.parcels.length || '—'}</dd>
        </div>
      </dl>
      {editor.canEdit && (
        <Button onClick={drawBoundary} disabled={busy || editor.drawing} variant="secondary" className="w-full">
          <PenLine className="h-4 w-4" />
          {editor.map.boundary ? t('editor.terrain.redraw') : t('editor.terrain.draw')}
        </Button>
      )}
      {editor.drawing && <p className="text-xs text-loam-500">{t('editor.draw_hint')}</p>}
    </div>
  )
}
