import clsx from 'clsx'
import { Check, LandPlot, Spline } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Field'
import { t } from '@/lib/i18n'
import { useEditor, type Editor } from '@/map/editor/EditorContext'
import { featureColor } from '@/map/drawing/catalog'
import { StepBackButton } from '@/map/drawing/StepBackButton'
import { revealForDrawing, useDrawingState } from '@/map/drawing/store'
import { isZoneKind, nextZoneColor, ZONE_COLORS, type ZoneKind } from '@/map/zones/zones'

/** Zones go to the notes layer: they annotate the plan for the client. */
export const ZONE_LAYER = 'notes'

/**
 * The « Zone » tool: a name, a colour, then a surface or a path drawn on
 * the map. The name is written across the zone with its area (or a path's
 * length), the way a designer annotates a plan for a client. Surfaces
 * start with rounded corners, as drawn by hand. The tool stays
 * open for the next zone, with the next colour, until « Terminer ».
 */
export function ZoneTool({ onClose }: { onClose: () => void }) {
  const editor = useEditor()
  const latest = useRef<Editor>(editor)
  latest.current = editor
  const used = () => latest.current.features.filter((f) => isZoneKind(f.properties.kind)).map(featureColor)
  const [name, setName] = useState('')
  const [color, setColor] = useState(() => nextZoneColor(used()))
  const [drawing, setDrawing] = useState<ZoneKind | null>(null)
  const version = useDrawingState((s) => s.version)
  const nameInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!drawing) nameInput.current?.focus()
  }, [drawing])
  useEffect(() => () => latest.current.cancelDraw(), [])

  async function draw(kind: ZoneKind) {
    revealForDrawing(ZONE_LAYER, kind)
    setDrawing(kind)
    const geometry = await latest.current.draw(kind === 'zone' ? 'polygon' : 'linestring', { color })
    setDrawing(null)
    if (!geometry) return
    const label = name.trim()
    try {
      const feature = await latest.current.createFeature({
        // Drawn while a version is shown: it belongs to that version.
        ...(version ? { tags: [version] } : {}),
        layer: ZONE_LAYER, kind, geometry, properties: kind === 'zone' ? { rounded: true } : {}, style: { color }, ...(label ? { name: label } : {}),
      })
      latest.current.select(feature.properties.id)
      latest.current.notify(t(label ? 'zones.created' : 'zones.created_unnamed'))
      setName('')
      setColor(nextZoneColor([...used(), color]))
    } catch (error) {
      latest.current.notify((error as Error).message, 'error')
    }
  }

  if (drawing) {
    return (
      <div className="pointer-events-auto flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-loam-900/90 px-3 py-2 text-sm text-white shadow-lg" role="status">
        <span className="h-3 w-3 shrink-0 rounded-full ring-1 ring-white/70" style={{ background: color }} aria-hidden />
        <span className="min-w-0 flex-1">{t(drawing === 'zone' ? 'zones.hint_surface' : 'zones.hint_path')}</span>
        <div className="flex shrink-0 gap-2">
          <StepBackButton editor={editor} />
          <Button size="sm" variant="secondary" onClick={() => editor.finishDraw()}>{t('drawing.toolbar.finish')}</Button>
          <Button size="sm" variant="ghost" className="text-white hover:bg-white/10" onClick={() => editor.cancelDraw()}>{t('drawing.toolbar.cancel')}</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="pointer-events-auto rounded-xl bg-white p-3 shadow-xl ring-1 ring-loam-200" role="region" aria-label={t('zones.title')}>
      <p className="text-sm text-loam-600">{t('zones.intro')}</p>
      {version && <p className="mt-2 rounded-lg bg-prune-50 px-2.5 py-1.5 text-sm text-prune-800">{t('zones.in_version', { version })}</p>}
      <label className="mt-3 block">
        <span className="text-sm font-medium text-loam-800">{t('zones.name')}</span>
        <Input
          ref={nameInput}
          value={name}
          maxLength={120}
          placeholder={t('zones.name_placeholder')}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void draw('zone')}
          className="mt-1"
        />
      </label>
      <div className="mt-3 flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label={t('zones.color')}>
        <span className="mr-1 text-sm font-medium text-loam-800">{t('zones.color')}</span>
        {ZONE_COLORS.map((swatch) => (
          <button
            key={swatch}
            type="button"
            role="radio"
            aria-checked={color === swatch}
            aria-label={swatch}
            onClick={() => setColor(swatch)}
            className={clsx('grid h-7 w-7 place-items-center rounded-full ring-1 ring-loam-300', color === swatch && 'ring-2 ring-prune-600 ring-offset-1')}
            style={{ background: swatch }}
          >
            {color === swatch && <Check className="h-3.5 w-3.5 text-white" />}
          </button>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => void draw('zone')}
          className="flex items-center gap-2 rounded-lg p-2 text-left ring-1 ring-loam-200 hover:bg-loam-50 focus-visible:outline-2 focus-visible:outline-prune-600"
        >
          <LandPlot className="h-5 w-5 shrink-0" style={{ color }} aria-hidden />
          <span className="min-w-0">
            <span className="block text-sm font-medium text-loam-900">{t('zones.surface')}</span>
            <span className="block text-sm text-loam-500">{t('zones.surface_hint')}</span>
          </span>
        </button>
        <button
          type="button"
          onClick={() => void draw('line')}
          className="flex items-center gap-2 rounded-lg p-2 text-left ring-1 ring-loam-200 hover:bg-loam-50 focus-visible:outline-2 focus-visible:outline-prune-600"
        >
          <Spline className="h-5 w-5 shrink-0" style={{ color }} aria-hidden />
          <span className="min-w-0">
            <span className="block text-sm font-medium text-loam-900">{t('zones.path')}</span>
            <span className="block text-sm text-loam-500">{t('zones.path_hint')}</span>
          </span>
        </button>
      </div>
      <div className="mt-3 flex justify-end">
        <Button size="sm" variant="ghost" onClick={onClose}>{t('drawing.toolbar.close')}</Button>
      </div>
    </div>
  )
}
