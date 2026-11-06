import { useEffect, useMemo } from 'react'
import { useEditor } from '@/map/editor/EditorContext'
import { inVariant } from '@/map/variants/variants'
import { useShownVariant } from '@/map/variants/store'
import { reliefOverlayGrid, setReliefWorks, useReliefOverlay } from '@/relief/overlayStore'
import { waterDesigns } from '@/relief/waterDesigns'
import type { Design } from '@/relief/design'

const NO_WORKS: Design[] = []

/**
 * Overlay without UI: the flow axes on the 2D map follow the editor's mode.
 * « Existant »: the terrain as it is. « Projet »: the relief dug with the
 * water works of the variant shown (ponds, swales, check dams, hedge
 * banks…), the same axes as the 3D view, which digs them by default.
 */
export default function ReliefWorksSync() {
  const editor = useEditor()
  const mapId = editor.map.id
  const { mode } = useReliefOverlay(mapId)
  const grid = mode === 'flow' ? reliefOverlayGrid(mapId) : null
  const variant = useShownVariant()
  const project = editor.mode === 'project'
  const designs = useMemo(() => {
    if (!grid || !project) return NO_WORKS
    const meta = { west: grid.west, north: grid.north, step: grid.step, cols: grid.cols, rows: grid.rows, cellSizeM: grid.cellSizeM }
    const features = editor.features.filter((f) => inVariant(f.properties, variant?.id ?? null))
    const { designs: found } = waterDesigns(meta, features as never)
    return found.length ? found : NO_WORKS
  }, [grid, project, editor.features, variant?.id])

  useEffect(() => {
    void setReliefWorks(editor.instance, mapId, designs)
  }, [editor.instance, mapId, designs])

  return null
}
