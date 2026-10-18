import type { Geometry, Position } from 'geojson'
import type { Map as MapLibreMap } from 'maplibre-gl'
import {
  TerraDraw,
  TerraDrawFreehandLineStringMode,
  TerraDrawFreehandMode,
  TerraDrawLineStringMode,
  TerraDrawPointMode,
  TerraDrawPolygonMode,
  TerraDrawRectangleMode,
  TerraDrawModeUndoRedo,
  TerraDrawSelectMode,
  type GeoJSONStoreFeatures,
  type GeoJSONStoreGeometries,
} from 'terra-draw'
import { TerraDrawMapLibreGLAdapter } from 'terra-draw-maplibre-gl-adapter'

export type DrawShape = 'polygon' | 'linestring' | 'point' | 'rectangle' | 'freehand' | 'freehand-linestring'

export type DrawOptions = {
  /** Called with the shape as it is being drawn or edited (live measures). */
  onChange?: (geometry: Geometry | null) => void
  /** Ink colour of the shape being drawn. */
  color?: string
}

const COLOR = '#5b5781'
const SELECT_MODE = 'select'
// Terra Draw refuses coordinates more precise than its default (9 decimals).
const PRECISION = 1e9

// The geometry type each drawing mode produces (guidance points aside).
const SHAPE_GEOMETRY: Record<DrawShape, Geometry['type']> = {
  polygon: 'Polygon',
  rectangle: 'Polygon',
  freehand: 'Polygon',
  linestring: 'LineString',
  'freehand-linestring': 'LineString',
  point: 'Point',
}

/**
 * One Terra Draw instance per map, used as a "draw one shape and give it
 * back" service: `draw('polygon')` resolves with the finished geometry, or
 * null when cancelled (Escape or `cancel()`). `edit(geometry)` lets the user
 * reshape an existing geometry (select mode: drag vertices, midpoints, the
 * whole shape) until `commit()` resolves it, or `cancel()` resolves null.
 * `undo()` / `redo()` step back through the points of a shape being drawn
 * (Terra Draw's own history) or through the drags of a shape being edited.
 */
export class Drawer {
  private terra: TerraDraw
  private pending: { resolve: (g: Geometry | null) => void; options: DrawOptions; shape: DrawShape | null } | null = null
  private editedId: string | number | null = null
  // The edited shape after each drag, the first being the shape as it came.
  private steps: Geometry[] = []
  private undoneSteps: Geometry[] = []

  constructor(private map: MapLibreMap) {
    const styles = {
      fillColor: COLOR as `#${string}`,
      outlineColor: COLOR as `#${string}`,
      fillOpacity: 0.25,
      outlineWidth: 2,
    }
    const editable = {
      feature: {
        draggable: true,
        coordinates: { draggable: true, deletable: true, midpoints: true },
      },
    }
    this.terra = new TerraDraw({
      adapter: new TerraDrawMapLibreGLAdapter({ map }),
      // Points of the shape being drawn; the shortcuts are the editor's (show.tsx).
      undoRedo: { modeLevel: new TerraDrawModeUndoRedo() },
      modes: [
        new TerraDrawPolygonMode({ styles }),
        new TerraDrawRectangleMode({ styles }),
        new TerraDrawFreehandMode({ styles }),
        new TerraDrawLineStringMode({ styles: { lineStringColor: COLOR, lineStringWidth: 3 } }),
        new TerraDrawFreehandLineStringMode({
          minDistance: 6,
          drawInteraction: 'click-move-or-drag',
          styles: { lineStringColor: COLOR, lineStringWidth: 3 },
        }),
        new TerraDrawPointMode({ styles: { pointColor: COLOR, pointWidth: 7, pointOutlineColor: '#ffffff', pointOutlineWidth: 2 } }),
        new TerraDrawSelectMode({
          allowManualDeselection: false,
          flags: {
            polygon: { feature: { ...editable.feature, selfIntersectable: false } },
            linestring: editable,
            point: { feature: { draggable: true } },
          },
          styles: {
            selectedPolygonColor: '#c97b3d',
            selectedPolygonOutlineColor: '#c97b3d',
            selectedPolygonFillOpacity: 0.2,
            selectedLineStringColor: '#c97b3d',
            selectedLineStringWidth: 4,
            selectedPointColor: '#c97b3d',
            selectedPointWidth: 8,
            selectionPointColor: '#ffffff',
            selectionPointOutlineColor: '#c97b3d',
            selectionPointWidth: 6,
            selectionPointOutlineWidth: 2,
            midPointColor: '#c97b3d',
            midPointOutlineColor: '#ffffff',
            midPointWidth: 4,
          },
        }),
      ],
    })
    this.terra.on('finish', (id) => {
      // In select mode "finish" ends a drag: the edit goes on until commit().
      if (this.editedId != null) {
        this.keepStep()
        return this.emitChange()
      }
      const feature = this.terra.getSnapshotFeature(id)
      this.finish(feature ? (feature.geometry as Geometry) : null)
    })
    this.terra.on('change', () => this.emitChange())
    window.addEventListener('keydown', this.onKey)
  }

  get active() {
    return this.pending !== null
  }

  get editing() {
    return this.editedId != null
  }

  draw(shape: DrawShape, options: DrawOptions = {}): Promise<Geometry | null> {
    this.finish(null)
    if (!this.terra.enabled) this.terra.start()
    if (shape === 'linestring' || shape === 'freehand-linestring') {
      const lineStringColor = (options.color ?? COLOR) as `#${string}`
      this.terra.updateModeOptions<typeof TerraDrawLineStringMode>(shape, { styles: { lineStringColor, lineStringWidth: 3 } })
    }
    this.terra.setMode(shape)
    return new Promise((resolve) => {
      this.pending = { resolve, options, shape }
    })
  }

  /** Reshape an existing Point, LineString or Polygon; null if unsupported. */
  edit(geometry: Geometry, options: DrawOptions = {}): Promise<Geometry | null> {
    this.finish(null)
    const mode = { Point: 'point', LineString: 'linestring', Polygon: 'polygon' }[geometry.type as string]
    if (!mode) return Promise.resolve(null)
    if (!this.terra.enabled) this.terra.start()
    this.terra.setMode(SELECT_MODE)
    const [result] = this.terra.addFeatures([
      { type: 'Feature', geometry: roundGeometry(geometry), properties: { mode } } as GeoJSONStoreFeatures,
    ])
    if (!result?.valid) {
      this.terra.stop()
      return Promise.resolve(null)
    }
    this.editedId = result.id as string | number
    this.terra.selectFeature(this.editedId)
    this.steps = [this.currentGeometry() as Geometry]
    this.undoneSteps = []
    return new Promise((resolve) => {
      this.pending = { resolve, options, shape: null }
    })
  }

  /**
   * Finish now: an edit resolves with the reshaped geometry; a line or a
   * polygon being drawn is closed as Terra Draw would on Enter.
   */
  commit() {
    if (!this.pending) return
    if (this.editedId != null) return this.finish(this.currentGeometry())
    this.map.getCanvas().dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }))
  }

  cancel() {
    this.finish(null)
  }

  /** Step back in the shape being drawn or edited; false when there is nothing to undo there. */
  undo(): boolean {
    if (!this.pending) return false
    if (this.editedId == null) return this.terra.canUndo() && this.terra.undo()
    if (this.steps.length < 2) return false
    this.undoneSteps.push(this.steps.pop() as Geometry)
    this.showStep(this.steps[this.steps.length - 1])
    return true
  }

  redo(): boolean {
    if (!this.pending) return false
    if (this.editedId == null) return this.terra.canRedo() && this.terra.redo()
    const next = this.undoneSteps.pop()
    if (!next) return false
    this.steps.push(next)
    this.showStep(next)
    return true
  }

  destroy() {
    window.removeEventListener('keydown', this.onKey)
    this.finish(null)
  }

  private onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && this.pending) this.cancel()
  }

  private currentGeometry(): Geometry | null {
    if (this.editedId != null) return (this.terra.getSnapshotFeature(this.editedId)?.geometry as Geometry) ?? null
    const type = this.pending?.shape ? SHAPE_GEOMETRY[this.pending.shape] : null
    const shape = this.terra.getSnapshot().find((f) => f.geometry.type === type && type !== 'Point')
    return (shape?.geometry as Geometry) ?? null
  }

  private keepStep() {
    const geometry = this.currentGeometry()
    const last = this.steps[this.steps.length - 1]
    if (!geometry || JSON.stringify(geometry) === JSON.stringify(last)) return
    this.steps.push(geometry)
    this.undoneSteps = []
  }

  private showStep(geometry: Geometry) {
    const id = this.editedId as string | number
    // Reselecting redraws the vertex handles where the shape now is.
    this.terra.deselectFeature(id)
    this.terra.updateFeatureGeometry(id, geometry as GeoJSONStoreGeometries)
    this.terra.selectFeature(id)
    this.emitChange()
  }

  private emitChange() {
    this.pending?.options.onChange?.(this.currentGeometry())
  }

  private finish(geometry: Geometry | null) {
    const pending = this.pending
    this.pending = null
    this.editedId = null
    this.steps = []
    this.undoneSteps = []
    if (this.terra.enabled) {
      // Leaving the editor mid-drawing, the map may already be gone with its
      // drawing sources: there is nothing left to clear, but still stop.
      try {
        this.terra.clearUndoRedoHistory()
        this.terra.clear()
      } catch {}
      try {
        this.terra.stop()
      } catch {}
    }
    pending?.resolve(geometry)
  }
}

function roundGeometry(geometry: Geometry): Geometry {
  const round = (p: Position): Position => p.map((c) => Math.round(c * PRECISION) / PRECISION)
  switch (geometry.type) {
    case 'Point': return { ...geometry, coordinates: round(geometry.coordinates) }
    case 'LineString': return { ...geometry, coordinates: geometry.coordinates.map(round) }
    case 'Polygon': return { ...geometry, coordinates: geometry.coordinates.map((ring) => ring.map(round)) }
    default: return geometry
  }
}
