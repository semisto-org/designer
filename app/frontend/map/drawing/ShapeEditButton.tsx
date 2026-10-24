import { Move, PenLine, Spline } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { t } from '@/lib/i18n'
import { useEditor } from '@/map/editor/EditorContext'
import { startShapeEdit } from '@/map/drawing/store'
import type { MapFeature } from '@/types'

const EDITABLE_GEOMETRIES = ['Point', 'LineString', 'Polygon']

/**
 * « Déplacer » for a point, « Modifier la forme » for a line or a surface
 * (M, see moveShortcut.ts), and for a line « Continuer le tracé », which
 * draws on from its end (a fence finished too early); nothing for viewers.
 */
export default function ShapeEditButton({ feature }: { feature: MapFeature }) {
  const editor = useEditor()
  // Off the map (a plant's sheet opened from the « Palette végétale »), there is nothing to drag on.
  if (!editor.canEdit || !editor.instance || !EDITABLE_GEOMETRIES.includes(feature.geometry.type)) return null
  const point = feature.geometry.type === 'Point'
  const Icon = point ? Move : Spline
  const edit = (
    <Button variant="secondary" size="sm" className="w-full" disabled={editor.drawing} title={t(point ? 'drawing.edit.move_title' : 'drawing.edit.start_title')}
      onClick={() => startShapeEdit(feature.properties.id)}>
      <Icon className="h-4 w-4" />
      {t(point ? 'drawing.edit.move' : 'drawing.edit.start')}
      <ShortcutKey />
    </Button>
  )
  if (feature.geometry.type !== 'LineString') return edit
  return (
    <div className="flex flex-col gap-2">
      {edit}
      <Button variant="secondary" size="sm" className="w-full" disabled={editor.drawing} title={t('drawing.edit.extend_title')}
        onClick={() => startShapeEdit(feature.properties.id, 'inspector', 'extend')}>
        <PenLine className="h-4 w-4" />
        {t('drawing.edit.extend')}
      </Button>
    </div>
  )
}

/** The key that does the same, for keyboards only (hidden on touch screens). */
export function ShortcutKey() {
  return (
    <kbd aria-hidden className="hidden rounded-md border border-current/20 px-1.5 font-sans text-sm leading-5 opacity-70 [@media(pointer:fine)]:inline">M</kbd>
  )
}
