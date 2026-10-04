import clsx from 'clsx'
import type { Geometry } from 'geojson'
import { RotateCcw, Save, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { formatArea, formatLength, t } from '@/lib/i18n'
import { useEditor, type Editor } from '@/map/editor/EditorContext'
import { measure } from '@/map/editor/measure'
import { showMeasure } from '@/map/drawing/style'

type Mode = 'distance' | 'area'

const round1 = (n: number) => Math.round(n * 10) / 10

/** Stored values of a saved measure (shown on the map by its label layer). */
export function measureProperties(geometry: Geometry): Record<string, number> {
  const m = measure(geometry)
  return m.area != null ? { area_m2: round1(m.area), length_m: round1(m.length ?? 0) } : { length_m: round1(m.length ?? 0) }
}

function label(geometry: Geometry): string {
  const m = measure(geometry)
  return m.area != null ? formatArea(m.area) : formatLength(m.length)
}

/**
 * Live distance and area measures. Nothing is saved unless the user asks
 * ("Enregistrer la mesure" keeps it as a note on the map).
 */
export function MeasureTool({ onClose }: { onClose: () => void }) {
  const editor = useEditor()
  const latest = useRef<Editor>(editor)
  latest.current = editor
  const map = editor.instance
  const [mode, setMode] = useState<Mode>('distance')
  const [live, setLive] = useState<Geometry | null>(null)
  const [result, setResult] = useState<Geometry | null>(null)
  const [saving, setSaving] = useState(false)
  const run = useRef(0)
  const pending = useRef(false)

  async function start(next: Mode) {
    const id = ++run.current
    setMode(next)
    setResult(null)
    setLive(null)
    showMeasure(map, null)
    pending.current = true
    const geometry = await latest.current.draw(next === 'area' ? 'polygon' : 'linestring', {
      onChange: (g) => run.current === id && setLive(g),
    })
    if (run.current !== id) return
    pending.current = false
    setLive(null)
    if (geometry) {
      setResult(geometry)
      showMeasure(map, geometry, label(geometry))
    }
  }

  useEffect(() => {
    void start('distance')
    return () => {
      run.current++
      if (pending.current) latest.current.cancelDraw()
      pending.current = false
      showMeasure(map, null)
    }
    // Starts once; `start` only reads refs and setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map])

  async function save() {
    if (!result) return
    setSaving(true)
    try {
      const feature = await editor.createFeature({
        layer: 'notes',
        kind: 'measure',
        geometry: result,
        properties: measureProperties(result),
      })
      editor.notify(t('drawing.measure.saved'))
      onClose()
      editor.select(feature.properties.id)
    } catch (error) {
      editor.notify((error as Error).message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const shown = live ?? result
  const m = shown ? measure(shown) : null
  const drawingNow = live != null || (!result && editor.drawing)

  return (
    <div className="pointer-events-auto rounded-xl bg-white p-3 shadow-xl ring-1 ring-loam-200" role="region" aria-label={t('drawing.toolbar.measure')}>
      <div className="flex items-center gap-2">
        <div className="flex rounded-lg bg-loam-100 p-0.5" role="radiogroup">
          {(['distance', 'area'] as Mode[]).map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={mode === value}
              onClick={() => void start(value)}
              className={clsx('rounded-md px-3 py-1 text-sm', mode === value ? 'bg-white font-medium text-loam-900 shadow-sm' : 'text-loam-600')}
            >
              {t(`drawing.measure.${value}`)}
            </button>
          ))}
        </div>
        <button type="button" onClick={onClose} className="ml-auto rounded p-1 text-loam-400 hover:bg-loam-100" aria-label={t('drawing.measure.close')}>
          <X className="h-4 w-4" />
        </button>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-2" aria-live="polite">
        {mode === 'area' && (
          <div>
            <dt className="text-xs text-loam-500">{t('drawing.measure.surface')}</dt>
            <dd className="text-lg font-semibold tabular-nums text-loam-900">{m?.area != null ? formatArea(m.area) : '—'}</dd>
          </div>
        )}
        <div>
          <dt className="text-xs text-loam-500">{t(mode === 'area' ? 'drawing.measure.perimeter' : 'drawing.measure.length')}</dt>
          <dd className="text-lg font-semibold tabular-nums text-loam-900">{m?.length != null ? formatLength(m.length) : '—'}</dd>
        </div>
      </dl>
      <p className="mt-1 text-xs text-loam-500">
        {result ? t('drawing.measure.not_saved') : shown ? t(`drawing.measure.hint_${mode}`) : t('drawing.measure.start')}
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        {drawingNow && (
          <Button size="sm" variant="secondary" onClick={() => editor.finishDraw()}>{t('drawing.toolbar.finish')}</Button>
        )}
        {result && (
          <>
            <Button size="sm" variant="secondary" onClick={() => void start(mode)}>
              <RotateCcw className="h-4 w-4" />
              {t('drawing.measure.again')}
            </Button>
            {editor.canEdit && (
              <Button size="sm" onClick={save} disabled={saving}>
                <Save className="h-4 w-4" />
                {t('drawing.measure.save')}
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
