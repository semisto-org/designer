import { Compass } from 'lucide-react'
import type { LineString } from 'geojson'
import { Button } from '@/components/ui/Button'
import { t } from '@/lib/i18n'
import { useEditor } from '@/map/editor/EditorContext'
import { rangeText } from '@/map/sectors/labels'
import { sectorDirections } from '@/map/sectors/sectors'
import type { MapFeature } from '@/types'

/** Inspector section of a sector: its directions, and the way to its panel, where its type, arc and colour change together. */
export default function SectorInspector({ feature }: { feature: MapFeature }) {
  const editor = useEditor()
  const center = editor.map.center ?? (editor.instance.getCenter().toArray() as [number, number])
  const range = sectorDirections(feature.properties, feature.geometry as LineString, center)
  return (
    <div className="space-y-2 text-sm">
      {range && <p className="text-loam-700">{t('sectors.inspector.directions', { range: rangeText(range.from, range.to) })}</p>}
      <Button size="sm" variant="secondary" onClick={() => editor.openPanel('sectors')}>
        <Compass className="h-4 w-4" aria-hidden />{t(editor.canEdit ? 'sectors.inspector.edit' : 'sectors.inspector.open')}
      </Button>
    </div>
  )
}
