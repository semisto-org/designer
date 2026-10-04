import clsx from 'clsx'
import type { LineString, MultiLineString } from 'geojson'
import { Check } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { t } from '@/lib/i18n'
import { useEditor, type Editor } from '@/map/editor/EditorContext'
import { saveFeature } from '@/map/drawing/save'

// Inks (from Terranova's sketch layer): white with a dark halo reads on
// aerial photos and on light maps alike.
export const INKS = ['#ffffff', '#1b1712', '#d64545', '#ef9b0d', '#ffd43b', '#1f6b46', '#2a6fdb', '#5b5781']

/** Terra Draw shows the stroke being drawn without halo: never white. */
const previewColor = (ink: string) => (ink === '#ffffff' ? '#5b5781' : ink)

/**
 * Freehand sketch (Terra Draw freehand line): stroke after stroke until
 * "Terminer". The strokes of one ink form one sketch, saved in the notes
 * layer as a (multi) line.
 */
export function SketchTool({ onClose }: { onClose: () => void }) {
  const editor = useEditor()
  const latest = useRef<Editor>(editor)
  latest.current = editor
  const [ink, setInk] = useState(INKS[0])
  const sketchId = useRef<number | null>(null)
  const session = useRef(0)

  useEffect(() => {
    const id = ++session.current
    sketchId.current = null
    void (async () => {
      while (session.current === id) {
        const stroke = (await latest.current.draw('freehand-linestring', { color: previewColor(ink) })) as LineString | null
        if (session.current !== id) return
        if (!stroke) return onClose()
        await addStroke(stroke)
      }
    })()
    return () => {
      session.current++
      latest.current.cancelDraw()
    }
    // A new ink starts a new sketch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ink])

  async function addStroke(stroke: LineString) {
    const editor = latest.current
    const existing = sketchId.current != null ? editor.features.find((f) => f.properties.id === sketchId.current) : null
    if (!existing) {
      try {
        const feature = await editor.createFeature({ layer: 'notes', kind: 'sketch', geometry: stroke, style: { color: ink } })
        sketchId.current = feature.properties.id
        editor.notify(t('drawing.sketch.saved'))
      } catch (error) {
        editor.notify((error as Error).message, 'error')
      }
      return
    }
    const previous = existing.geometry as LineString | MultiLineString
    const lines = previous.type === 'LineString' ? [previous.coordinates] : previous.coordinates
    await saveFeature(editor, existing.properties.id, { geometry: { type: 'MultiLineString', coordinates: [...lines, stroke.coordinates] } })
  }

  return (
    <div className="pointer-events-auto rounded-xl bg-white p-3 shadow-xl ring-1 ring-loam-200" role="region" aria-label={t('drawing.toolbar.sketch')}>
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-loam-400">{t('drawing.sketch.ink')}</span>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={t('drawing.sketch.ink')}>
          {INKS.map((color) => (
            <button
              key={color}
              type="button"
              role="radio"
              aria-checked={ink === color}
              aria-label={color}
              onClick={() => setInk(color)}
              className={clsx('grid h-7 w-7 place-items-center rounded-full ring-1 ring-loam-300', ink === color && 'ring-2 ring-prune-600 ring-offset-1')}
              style={{ background: color }}
            >
              {ink === color && <Check className={clsx('h-3.5 w-3.5', color === '#ffffff' || color === '#ffd43b' ? 'text-loam-900' : 'text-white')} />}
            </button>
          ))}
        </div>
      </div>
      <p className="mt-2 text-xs text-loam-500">{t('drawing.sketch.hint')}</p>
      <div className="mt-2 flex justify-end">
        <Button size="sm" onClick={onClose}>{t('drawing.toolbar.finish')}</Button>
      </div>
    </div>
  )
}
