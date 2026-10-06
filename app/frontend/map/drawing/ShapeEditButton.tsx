import { Move, Spline } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { t } from '@/lib/i18n'
import { useEditor } from '@/map/editor/EditorContext'
import { startShapeEdit } from '@/map/drawing/store'
import type { MapFeature } from '@/types'

const EDITABLE_GEOMETRIES = ['Point', 'LineString', 'Polygon']

/** « Déplacer » for a point, « Modifier la forme » for a line or a surface; nothing for viewers. */
export default function ShapeEditButton({ feature }: { feature: MapFeature }) {
  const editor = useEditor()
  if (!editor.canEdit || !EDITABLE_GEOMETRIES.includes(feature.geometry.type)) return null
  const point = feature.geometry.type === 'Point'
  const Icon = point ? Move : Spline
  return (
    <Button variant="secondary" size="sm" className="w-full" disabled={editor.drawing} onClick={() => startShapeEdit(feature.properties.id)}>
      <Icon className="h-4 w-4" />
      {t(point ? 'drawing.edit.move' : 'drawing.edit.start')}
    </Button>
  )
}
