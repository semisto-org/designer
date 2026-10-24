import type { Feature, Geometry, LineString, Polygon, Position } from 'geojson'
import type { GeoJSONSource, Map as MapLibreMap, MapMouseEvent } from 'maplibre-gl'
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
import { editableVertices, endIndex, extendClick, extendLine, insertVertex, removeVertex, sideAt, vertexAt, type LineEnd, type Pixel } from '@/map/editor/vertices'

export type DrawShape = 'polygon' | 'linestring' | 'point' | 'rectangle' | 'freehand' | 'freehand-linestring'

/**
 * What a click does on a line or polygon being edited, as in Illustrator:
 * move (A or V) drags points and picks one for Delete, add (+) puts a point
 * on a side, remove (-) takes a point away. Alt held swaps add and remove.
 * On a line, extend (P, Illustrator's pen on an end point) draws on from
 * one of its ends, a point per click, as if it had never been finished.
 */
export type PointTool = 'move' | 'add' | 'remove' | 'extend'

export type DrawOptions = {
  /** Called with the shape as it is being drawn or edited (live measures). */
  onChange?: (geometry: Geometry | null) => void
  /** Ink colour of the shape being drawn. */
  color?: string
  /** Called with the tool a click now uses on an edited shape (buttons, keys, Alt held). */
  onPointTool?: (tool: PointTool) => void
  /** Called when a point cannot be removed: a line keeps two, a polygon three. */
  onTooFewPoints?: () => void
  /** The tool the edit starts with (« Continuer le tracé » starts with extend). */
  pointTool?: PointTool
}

const COLOR = '#5b5781'
const EDIT_COLOR = '#c97b3d'
const REMOVE_COLOR = '#b4472f'
const SELECT_MODE = 'select'
// The point a click would add, the point it would remove, the point Delete removes.
const HINT_SOURCE = 'draw-vertex-hint'
// The dashed stretch from the end being continued to the pointer.
const HINT_LINE_LAYER = 'draw-vertex-hint-line'
const TOOL_CLASS = { add: 'draw-tool-add', remove: 'draw-tool-remove', extend: 'draw-tool-extend' } as const
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
 * whole shape, add and remove points) until `commit()` resolves it, or
 * `cancel()` resolves null. `undo()` / `redo()` step back through the
 * points of a shape being drawn (Terra Draw's own history) or through the
 * changes of a shape being edited (drags, points added or removed).
 */
export class Drawer {
  private terra: TerraDraw
  private pending: { resolve: (g: Geometry | null) => void; options: DrawOptions; shape: DrawShape | null } | null = null
  private editedId: string | number | null = null
  private pointTool: PointTool = 'move'
  private altHeld = false
  // The point last clicked or dragged in move mode: Delete removes it.
  private activeVertex: number | null = null
  private pointer: Pixel | null = null
  // The end a line is continued from, and how many points it had then.
  private extendEnd: LineEnd = 'end'
  private extendBase = 0
  private doubleClickZoom = false
  // The edited shape after each change, the first being the shape as it came.
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
          // The keyboard is ours (Escape, Delete, + and -) and so are clicks
          // outside the move tool: points are added and removed in edited().
          keyEvents: { deselect: null, delete: null, rotate: null, scale: null },
          pointerEvents: {
            leftClick: () => this.tool === 'move',
            rightClick: false,
            contextMenu: false,
            onDragStart: () => this.tool === 'move',
            onDrag: true,
            onDragEnd: true,
          },
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
    this.terra.on('finish', (id, context) => {
      // In select mode "finish" ends a drag or a midpoint click: the edit goes on until commit().
      if (this.editedId != null) {
        if (context.action === 'dragCoordinate' || context.action === 'insertMidpoint') this.pickVertexAtPointer()
        return this.edited()
      }
      const feature = this.terra.getSnapshotFeature(id)
      this.finish(feature ? (feature.geometry as Geometry) : null)
    })
    this.terra.on('change', () => this.emitChange())
    // Captured, so + and - reach us before MapLibre's zoom keys.
    window.addEventListener('keydown', this.onKey, true)
    window.addEventListener('keyup', this.onKeyUp)
    window.addEventListener('blur', this.onBlur)
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
    if (mode !== 'point') {
      this.map.on('click', this.onMapClick)
      this.map.on('contextmenu', this.onContextMenu)
      this.map.on('mousemove', this.onMouseMove)
      this.map.on('mouseout', this.onMouseOut)
    }
    const promise = new Promise<Geometry | null>((resolve) => {
      this.pending = { resolve, options, shape: null }
    })
    if (options.pointTool && options.pointTool !== 'move') this.setPointTool(options.pointTool)
    return promise
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

  /** Choose what a click does on the shape being edited (the toolbar's buttons). */
  setPointTool(tool: PointTool) {
    if (!this.editingPoints) return
    if (tool === 'extend' && !this.editingLine) return
    if (tool !== 'move') this.activeVertex = null
    if (tool === 'extend' && this.pointTool !== 'extend') this.startExtending()
    else if (tool !== 'extend' && this.pointTool === 'extend') this.stopExtending()
    this.pointTool = tool
    this.refreshTool()
  }

  destroy() {
    window.removeEventListener('keydown', this.onKey, true)
    window.removeEventListener('keyup', this.onKeyUp)
    window.removeEventListener('blur', this.onBlur)
    this.finish(null)
  }

  /** A line or a polygon is being edited: it has points to add and remove. */
  private get editingPoints() {
    const type = this.editedGeometry()?.type
    return type === 'LineString' || type === 'Polygon'
  }

  private get editingLine() {
    return this.editedGeometry()?.type === 'LineString'
  }

  /** The tool a click uses now: Alt swaps adding and removing, as in Illustrator. */
  private get tool(): PointTool {
    if (!this.altHeld || this.pointTool === 'move' || this.pointTool === 'extend') return this.pointTool
    return this.pointTool === 'add' ? 'remove' : 'add'
  }

  private onKey = (e: KeyboardEvent) => {
    if (e.key === 'Alt' && this.editingPoints) {
      this.altHeld = true
      return this.refreshTool()
    }
    if (e.key === 'Escape' && this.pending) {
      // Escape first puts the point tools down, then leaves the edit.
      if (!this.editingPoints || this.pointTool === 'move') return this.cancel()
      this.setPointTool('move')
      return e.stopPropagation()
    }
    if (!this.editingPoints || e.metaKey || e.ctrlKey || typing(e.target)) return
    if (e.key === '+' || e.key === '=') this.setPointTool('add')
    else if (e.key === '-') this.setPointTool('remove')
    else if ((e.key === 'p' || e.key === 'P') && this.editingLine) this.setPointTool('extend')
    else if (e.key === 'a' || e.key === 'A' || e.key === 'v' || e.key === 'V') this.setPointTool('move')
    else if ((e.key === 'Delete' || e.key === 'Backspace') && this.activeVertex != null) this.removePoint(this.activeVertex)
    else return
    e.preventDefault()
    e.stopPropagation()
  }

  private onKeyUp = (e: KeyboardEvent) => {
    if (e.key === 'Alt' && this.altHeld) {
      this.altHeld = false
      this.refreshTool()
    }
  }

  private onBlur = () => {
    if (!this.altHeld) return
    this.altHeld = false
    this.refreshTool()
  }

  private onMapClick = (e: MapMouseEvent) => {
    const geometry = this.editedGeometry()
    if (!geometry) return
    const tool = this.tool
    if (tool === 'add') {
      const side = sideAt(geometry, e.point, this.project)
      if (side) this.applyGeometry(insertVertex(geometry, side.index, this.unproject(side.at)))
    } else if (tool === 'remove') {
      const index = vertexAt(geometry, e.point, this.project)
      if (index >= 0) this.removePoint(index)
    } else if (tool === 'extend' && geometry.type === 'LineString') {
      this.extendAt(geometry, e)
    } else {
      // Terra Draw may have added a point on a midpoint first: the new point is picked then.
      this.pointer = e.point
      this.pickVertexAtPointer()
      this.refreshHint()
    }
  }

  // A right click on a point removes it, whatever the tool.
  private onContextMenu = (e: MapMouseEvent) => {
    const geometry = this.editedGeometry()
    const index = geometry ? vertexAt(geometry, e.point, this.project) : -1
    if (index < 0) return
    e.preventDefault()
    this.removePoint(index)
  }

  private onMouseMove = (e: MapMouseEvent) => {
    this.pointer = e.point
    if (this.tool !== 'move') this.refreshHint()
  }

  private onMouseOut = () => {
    this.pointer = null
    this.refreshHint()
  }

  /** Continuing a line: the end it goes on from is the one it was finished at, unless the person picks the other. */
  private startExtending() {
    const line = this.editedGeometry()
    if (line?.type !== 'LineString') return
    this.extendEnd = 'end'
    this.extendBase = line.coordinates.length
    // A double click ends the line, as when drawing it, instead of zooming in.
    this.doubleClickZoom = this.map.doubleClickZoom.isEnabled()
    this.map.doubleClickZoom.disable()
  }

  private stopExtending() {
    if (this.doubleClickZoom) this.map.doubleClickZoom.enable()
    this.doubleClickZoom = false
  }

  private extendAt(line: LineString, e: MapMouseEvent) {
    const added = Math.max(0, line.coordinates.length - this.extendBase)
    const vertex = vertexAt(line, e.point, this.project)
    const action = extendClick(line, this.extendEnd, vertex, added)
    if (action === 'stop') return this.setPointTool('move')
    if (action === 'switch') {
      this.extendEnd = this.extendEnd === 'end' ? 'start' : 'end'
      return this.refreshHint()
    }
    const other = line.coordinates[endIndex(line, this.extendEnd === 'end' ? 'start' : 'end')]
    const position = action === 'close' ? other : e.lngLat.toArray()
    this.applyGeometry(extendLine(line, this.extendEnd, position))
    // Joined to its other end, the fence goes all the way round: the pen is put down.
    if (action === 'close') this.setPointTool('move')
  }

  private removePoint(index: number) {
    const geometry = this.editedGeometry()
    if (!geometry) return
    const next = removeVertex(geometry, index)
    if (!next) return this.pending?.options.onTooFewPoints?.()
    this.activeVertex = null
    this.applyGeometry(next)
  }

  /** A point added or removed: the same path as a drag, so it is undone like one. */
  private applyGeometry(geometry: LineString | Polygon) {
    if (this.editedId == null) return
    try {
      this.terra.updateFeatureGeometry(this.editedId, roundGeometry(geometry) as LineString | Polygon)
    } catch {
      // Terra Draw refuses a polygon that would cross itself: nothing changes.
      return
    }
    this.edited()
  }

  /** Every change to the edited shape ends here: a drag, a midpoint, a point added or removed. */
  private edited() {
    this.keepStep()
    this.emitChange()
    this.refreshHint()
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
    this.activeVertex = null
    this.terra.deselectFeature(id)
    this.terra.updateFeatureGeometry(id, geometry as GeoJSONStoreGeometries)
    this.terra.selectFeature(id)
    this.emitChange()
    this.refreshHint()
  }

  private pickVertexAtPointer() {
    const geometry = this.editedGeometry()
    const index = geometry && this.pointer ? vertexAt(geometry, this.pointer, this.project) : -1
    this.activeVertex = index >= 0 ? index : null
  }

  private editedGeometry(): LineString | Polygon | null {
    if (this.editedId == null) return null
    const geometry = this.terra.getSnapshotFeature(this.editedId)?.geometry
    return geometry?.type === 'LineString' || geometry?.type === 'Polygon' ? (geometry as LineString | Polygon) : null
  }

  private project = (position: Position): Pixel => this.map.project(position as [number, number])
  private unproject = (pixel: Pixel): Position => this.map.unproject([pixel.x, pixel.y]).toArray()

  private refreshTool() {
    const container = this.map.getContainer()
    const tool = this.editingPoints ? this.tool : 'move'
    container.classList.toggle(TOOL_CLASS.add, tool === 'add')
    container.classList.toggle(TOOL_CLASS.remove, tool === 'remove')
    container.classList.toggle(TOOL_CLASS.extend, tool === 'extend')
    this.refreshHint()
    this.pending?.options.onPointTool?.(this.tool)
  }

  /** Shows the point a click would add or remove, or the one Delete would remove. */
  private refreshHint() {
    const geometry = this.editedGeometry()
    const features: Feature[] = []
    const tool = this.tool
    if (geometry && this.pointer && tool === 'add') {
      const side = vertexAt(geometry, this.pointer, this.project) < 0 ? sideAt(geometry, this.pointer, this.project) : null
      if (side) features.push(hintPoint(this.unproject(side.at), 'add'))
    } else if (geometry && this.pointer && tool === 'remove') {
      const index = vertexAt(geometry, this.pointer, this.project)
      if (index >= 0) features.push(hintPoint(editableVertices(geometry)[index], 'remove'))
    } else if (geometry?.type === 'LineString' && tool === 'extend') {
      const end = geometry.coordinates[endIndex(geometry, this.extendEnd)]
      if (this.pointer) {
        const over = vertexAt(geometry, this.pointer, this.project)
        const to = over >= 0 ? editableVertices(geometry)[over] : this.unproject(this.pointer)
        if (over !== endIndex(geometry, this.extendEnd)) {
          features.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: [end, to] }, properties: { hint: 'stretch' } })
        }
      }
      features.push(hintPoint(end, 'active'))
    } else if (geometry && tool === 'move' && this.activeVertex != null) {
      const position = editableVertices(geometry)[this.activeVertex]
      if (position) features.push(hintPoint(position, 'active'))
    }
    this.showHint(features)
  }

  private showHint(features: Feature[]) {
    const data = { type: 'FeatureCollection' as const, features }
    try {
      const source = this.map.getSource(HINT_SOURCE) as GeoJSONSource | undefined
      if (source) return source.setData(data)
      if (!features.length) return
      this.map.addSource(HINT_SOURCE, { type: 'geojson', data })
      this.map.addLayer({
        id: HINT_LINE_LAYER,
        type: 'line',
        source: HINT_SOURCE,
        filter: ['==', ['geometry-type'], 'LineString'],
        paint: { 'line-color': EDIT_COLOR, 'line-width': 2, 'line-dasharray': [2, 2] },
      })
      this.map.addLayer({
        id: HINT_SOURCE,
        type: 'circle',
        source: HINT_SOURCE,
        filter: ['==', ['geometry-type'], 'Point'],
        paint: {
          'circle-radius': ['match', ['get', 'hint'], 'add', 5, 7],
          'circle-color': ['match', ['get', 'hint'], 'add', '#ffffff', 'remove', REMOVE_COLOR, EDIT_COLOR],
          'circle-stroke-color': ['match', ['get', 'hint'], 'add', EDIT_COLOR, '#ffffff'],
          'circle-stroke-width': 2,
        },
      })
    } catch {
      // The map style may be reloading or gone: the hint is only a help.
    }
  }

  private stopPointTools() {
    this.map.off('click', this.onMapClick)
    this.map.off('contextmenu', this.onContextMenu)
    this.map.off('mousemove', this.onMouseMove)
    this.map.off('mouseout', this.onMouseOut)
    if (this.pointTool === 'extend') this.stopExtending()
    this.pointTool = 'move'
    this.altHeld = false
    this.activeVertex = null
    this.pointer = null
    try {
      this.map.getContainer().classList.remove(TOOL_CLASS.add, TOOL_CLASS.remove, TOOL_CLASS.extend)
      if (this.map.getLayer(HINT_LINE_LAYER)) this.map.removeLayer(HINT_LINE_LAYER)
      if (this.map.getLayer(HINT_SOURCE)) this.map.removeLayer(HINT_SOURCE)
      if (this.map.getSource(HINT_SOURCE)) this.map.removeSource(HINT_SOURCE)
    } catch {}
  }

  private currentGeometry(): Geometry | null {
    if (this.editedId != null) return (this.terra.getSnapshotFeature(this.editedId)?.geometry as Geometry) ?? null
    const type = this.pending?.shape ? SHAPE_GEOMETRY[this.pending.shape] : null
    const shape = this.terra.getSnapshot().find((f) => f.geometry.type === type && type !== 'Point')
    return (shape?.geometry as Geometry) ?? null
  }

  private emitChange() {
    this.pending?.options.onChange?.(this.currentGeometry())
  }

  private finish(geometry: Geometry | null) {
    const pending = this.pending
    this.pending = null
    this.stopPointTools()
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

const hintPoint = (position: Position, hint: 'add' | 'remove' | 'active'): Feature => ({
  type: 'Feature',
  geometry: { type: 'Point', coordinates: position },
  properties: { hint },
})

// Keys typed in a field are text, not tools.
function typing(target: EventTarget | null) {
  const element = target as HTMLElement | null
  return !!element && (element.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName))
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
