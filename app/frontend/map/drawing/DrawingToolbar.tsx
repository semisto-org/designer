import clsx from 'clsx'
import type { Geometry } from 'geojson'
import { Pencil, Ruler, Shapes, type LucideIcon } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { formatArea, formatLength, t } from '@/lib/i18n'
import { useEditor, type Editor } from '@/map/editor/EditorContext'
import { measure } from '@/map/editor/measure'
import { drawShapeFor, storedProperties } from '@/map/drawing/catalog'
import { ElementPicker, rememberRecent } from '@/map/drawing/ElementPicker'
import { MeasureTool, measureProperties } from '@/map/drawing/MeasureTool'
import { saveFeature } from '@/map/drawing/save'
import { SketchTool } from '@/map/drawing/SketchTool'
import { drawingStore, setHiddenLayers, useDrawingState, type DrawingTool } from '@/map/drawing/store'
import type { ElementSpec } from '@/types/drawing'

function ToolButton({ icon: Icon, label, hint, active, onClick }: { icon: LucideIcon; label: string; hint: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      title={hint}
      className={clsx(
        'flex h-9 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium transition-colors active:scale-[0.98]',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-prune-600',
        active ? 'bg-prune-600 text-white' : 'text-loam-800 hover:bg-[#f4f1ea]',
      )}
    >
      <Icon className="h-4 w-4" aria-hidden />
      <span className="hidden sm:inline">{label}</span>
    </button>
  )
}

function HintBar({ text, children }: { text: string; children?: React.ReactNode }) {
  return (
    <div className="pointer-events-auto flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-loam-900/90 px-3 py-2 text-sm text-white shadow-lg" role="status">
      <span className="min-w-0 flex-1">{text}</span>
      <div className="flex shrink-0 gap-2">{children}</div>
    </div>
  )
}

const sameGeometry = (a: Geometry, b: Geometry) => JSON.stringify(a) === JSON.stringify(b)

/**
 * Drawing tools over the map: the element library (choose a layer, then an
 * element, then draw it), live measures and freehand sketches, plus the bar
 * of a shape being edited from the inspector. Viewers only get measures.
 */
export default function DrawingToolbar() {
  const editor = useEditor()
  const latest = useRef<Editor>(editor)
  latest.current = editor
  const tool = useDrawingState((s) => s.tool)
  const shapeEditId = useDrawingState((s) => s.shapeEditId)
  const [drawingSpec, setDrawingSpec] = useState<ElementSpec | null>(null)
  const [shapeMeasure, setShapeMeasure] = useState<string | null>(null)

  const setTool = useCallback((next: DrawingTool) => {
    // Switching tools abandons whatever was being drawn.
    if (drawingStore.get().tool !== next) latest.current.cancelDraw()
    drawingStore.set({ tool: next })
  }, [])
  const close = useCallback(() => setTool(null), [setTool])

  async function drawElement(spec: ElementSpec) {
    const editor = latest.current
    const hidden = drawingStore.get().hiddenLayers
    if (hidden.includes(spec.layer)) setHiddenLayers(hidden.filter((l) => l !== spec.layer))
    rememberRecent(spec.kind)
    setDrawingSpec(spec)
    const geometry = await editor.draw(drawShapeFor(spec.geometries[0]))
    setDrawingSpec(null)
    if (drawingStore.get().tool === 'draw') drawingStore.set({ tool: null })
    if (!geometry) return
    try {
      const feature = await latest.current.createFeature({ layer: spec.layer, kind: spec.kind, geometry, properties: { ...spec.defaults } })
      latest.current.select(feature.properties.id)
      latest.current.notify(t('drawing.toolbar.created', { kind: t(`editor.kinds.${spec.kind}`) }))
    } catch (error) {
      latest.current.notify((error as Error).message, 'error')
    }
  }

  // Shape editing, asked by the inspector (ElementSection).
  useEffect(() => {
    if (shapeEditId == null) return
    const editor = latest.current
    const feature = editor.features.find((f) => f.properties.id === shapeEditId)
    if (!feature) return void drawingStore.set({ shapeEditId: null, tool: null })
    let active = true
    const describe = (g: Geometry | null) => {
      if (!g) return setShapeMeasure(null)
      const m = measure(g)
      setShapeMeasure(m.area != null ? formatArea(m.area) : m.length != null ? formatLength(m.length) : null)
    }
    describe(feature.geometry)
    editor.select(null)
    void editor.editGeometry(feature.geometry, { onChange: (g) => active && describe(g) }).then(async (geometry) => {
      if (!active) return
      active = false
      drawingStore.set({ shapeEditId: null, tool: null })
      setShapeMeasure(null)
      const editor = latest.current
      if (!geometry) return editor.select(shapeEditId)
      const point = geometry.type === 'Point'
      if (sameGeometry(geometry, feature.geometry)) {
        editor.notify(t(point ? 'drawing.edit.unmoved' : 'drawing.edit.unchanged'))
      } else if (await saveFeature(editor, shapeEditId, {
        geometry,
        // A saved measure keeps its values in step with its shape.
        ...(feature.properties.kind === 'measure' ? { properties: { ...storedProperties(feature), ...measureProperties(geometry) } } : {}),
      })) {
        editor.notify(t(point ? 'drawing.edit.moved' : 'drawing.edit.saved'))
      }
      editor.select(shapeEditId)
    })
    const onKey = (e: KeyboardEvent) => e.key === 'Enter' && latest.current.finishDraw()
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      if (active) latest.current.cancelDraw()
      active = false
    }
  }, [shapeEditId])

  const movingPoint = shapeEditId != null && editor.features.find((f) => f.properties.id === shapeEditId)?.geometry.type === 'Point'
  const kindLabel = drawingSpec ? t(`editor.kinds.${drawingSpec.kind}`) : ''
  const geometry = drawingSpec?.geometries[0]

  return (
    <>
      <div className="pointer-events-none absolute left-1/2 top-2 z-20 -translate-x-1/2 md:top-3.5">
        <div role="toolbar" aria-label={t('drawing.toolbar.label')} className="pointer-events-auto flex items-center gap-0.5 rounded-xl bg-white p-1 shadow-[0_6px_16px_rgb(26_26_26/0.14)]">
          {editor.canEdit && (
            <ToolButton icon={Shapes} label={t('drawing.toolbar.draw')} hint={t('drawing.toolbar.draw_hint')} active={tool === 'draw'} onClick={() => setTool(tool === 'draw' ? null : 'draw')} />
          )}
          <ToolButton icon={Ruler} label={t('drawing.toolbar.measure')} hint={t('drawing.toolbar.measure_hint')} active={tool === 'measure'} onClick={() => setTool(tool === 'measure' ? null : 'measure')} />
          {editor.canEdit && (
            <ToolButton icon={Pencil} label={t('drawing.toolbar.sketch')} hint={t('drawing.toolbar.sketch_hint')} active={tool === 'sketch'} onClick={() => setTool(tool === 'sketch' ? null : 'sketch')} />
          )}
        </div>
      </div>

      {/* A shape started from a panel (outline, patch, zone…): the same way to finish it. */}
      {!tool && (editor.drawingShape === 'polygon' || editor.drawingShape === 'linestring') && (
        <div className="pointer-events-none absolute inset-x-2 top-14 z-30 md:left-1/2 md:right-auto md:w-[30rem] md:-translate-x-1/2">
          <HintBar text={t(editor.drawingShape === 'polygon' ? 'drawing.toolbar.hint_outline' : 'drawing.toolbar.hint_path')}>
            <Button size="sm" variant="secondary" onClick={() => editor.finishDraw()}>{t('drawing.toolbar.finish')}</Button>
            <Button size="sm" variant="ghost" className="text-white hover:bg-white/10" onClick={() => editor.cancelDraw()}>{t('drawing.toolbar.cancel')}</Button>
          </HintBar>
        </div>
      )}

      {tool && (
        <div className="pointer-events-none absolute inset-x-2 top-14 z-30 md:left-1/2 md:right-auto md:w-[30rem] md:-translate-x-1/2">
          {tool === 'draw' && !drawingSpec && (
            <ElementPicker onPick={(spec) => void drawElement(spec)} onClose={close} />
          )}
          {tool === 'draw' && drawingSpec && (
            <HintBar text={t(geometry === 'Point' ? 'drawing.toolbar.hint_point' : geometry === 'Polygon' ? 'drawing.toolbar.hint_polygon' : 'drawing.toolbar.hint_line', { kind: kindLabel })}>
              {geometry !== 'Point' && (
                <Button size="sm" variant="secondary" onClick={() => editor.finishDraw()}>{t('drawing.toolbar.finish')}</Button>
              )}
              <Button size="sm" variant="ghost" className="text-white hover:bg-white/10" onClick={() => editor.cancelDraw()}>{t('drawing.toolbar.cancel')}</Button>
            </HintBar>
          )}
          {tool === 'measure' && <MeasureTool onClose={close} />}
          {tool === 'sketch' && editor.canEdit && <SketchTool onClose={close} />}
          {tool === 'shape' && (
            <HintBar text={movingPoint ? t('drawing.edit.move_hint') : [t('drawing.edit.hint'), shapeMeasure].filter(Boolean).join(' · ')}>
              <Button size="sm" variant="secondary" onClick={() => editor.finishDraw()}>{t(movingPoint ? 'drawing.edit.save_position' : 'drawing.edit.save')}</Button>
              <Button size="sm" variant="ghost" className="text-white hover:bg-white/10" onClick={() => editor.cancelDraw()}>{t('drawing.edit.cancel')}</Button>
            </HintBar>
          )}
        </div>
      )}
    </>
  )
}
