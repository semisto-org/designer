import { usePage } from '@inertiajs/react'
import { bbox as turfBbox } from '@turf/turf'
import clsx from 'clsx'
import { FileText, Lock, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button, buttonClass } from '@/components/ui/Button'
import { Field, Input, Select } from '@/components/ui/Field'
import { formatLength, formatNumber, t } from '@/lib/i18n'
import { useEditor } from '@/map/editor/EditorContext'
import {
  attributions, exportPdf, fitScale, frameGeometry, groundSize, legendEntries, pageLayout, SCALES,
  type Orientation, type Paper,
} from '@/map/drawing/pdf'
import { useDrawingState } from '@/map/drawing/store'
import { showPrintFrame } from '@/map/drawing/style'
import type { BBox, SharedProps } from '@/types'

type Step = 'map' | 'pdf' | null

function Segmented<T extends string>({ value, options, onChange, label }: {
  value: T; options: { value: T; label: string }[]; onChange: (value: T) => void; label: string
}) {
  return (
    <div>
      <span className="block text-sm font-medium text-loam-700">{label}</span>
      <div className="mt-1 grid grid-flow-col auto-cols-fr gap-1 rounded-lg bg-loam-100 p-1" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            onClick={() => onChange(o.value)}
            className={clsx('rounded-md px-2 py-1 text-sm', value === o.value ? 'bg-white font-medium text-loam-900 shadow-sm' : 'text-loam-600 hover:text-loam-900')}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

/**
 * Side sheet of the PDF at scale: paper, orientation, scale (or fitted to the
 * terrain), title. The printed extent is drawn on the map; at a fixed scale
 * it follows the centre of the map, so the user frames the plan by moving it.
 */
export function PdfExportPanel({ onClose }: { onClose: () => void }) {
  const editor = useEditor()
  const { currentUser } = usePage().props as unknown as SharedProps
  const hidden = useDrawingState((s) => s.hiddenLayers)
  const instance = editor.instance
  const [title, setTitle] = useState(editor.map.name)
  const [paper, setPaper] = useState<Paper>('A4')
  const [orientation, setOrientation] = useState<Orientation>('landscape')
  const [scaleChoice, setScaleChoice] = useState<number | 'fit'>('fit')
  const [withNetworks, setWithNetworks] = useState(false)
  const [step, setStep] = useState<Step>(null)
  const [viewCenter, setViewCenter] = useState<[number, number]>(() => instance.getCenter().toArray() as [number, number])

  // What the plan covers when fitted: the terrain, else everything drawn.
  const extent = useMemo<BBox | null>(() => {
    if (editor.map.bbox) return editor.map.bbox
    const active = editor.features.filter((f) => f.properties.status === 'active')
    if (active.length === 0) return null
    return turfBbox({ type: 'FeatureCollection', features: active }) as BBox
  }, [editor.map.bbox, editor.features])

  const layout = pageLayout(paper, orientation)
  const fitted = scaleChoice === 'fit' && extent != null
  const scale = fitted ? fitScale(extent, layout.frame) : scaleChoice === 'fit' ? 500 : scaleChoice
  const center: [number, number] = fitted ? [(extent[0] + extent[2]) / 2, (extent[1] + extent[3]) / 2] : viewCenter
  const frame = useMemo(() => frameGeometry(center, scale, layout.frame), [center[0], center[1], scale, paper, orientation]) // eslint-disable-line react-hooks/exhaustive-deps
  const ground = groundSize(scale, layout.frame)
  const hiddenLayers = [...new Set([...hidden, ...(withNetworks && editor.canEdit ? [] : ['networks'])])]

  // The sheet takes the inspector's place.
  const select = editor.select
  useEffect(() => select(null), [select])

  // Choose the orientation that suits the terrain, once.
  const oriented = useRef(false)
  useEffect(() => {
    if (oriented.current || !extent) return
    oriented.current = true
    const [w, s, e, n] = extent
    const widthM = (e - w) * Math.cos((((s + n) / 2) * Math.PI) / 180)
    setOrientation(widthM >= n - s ? 'landscape' : 'portrait')
  }, [extent])

  // At a fixed scale the frame follows the map.
  useEffect(() => {
    const onMove = () => setViewCenter(instance.getCenter().toArray() as [number, number])
    instance.on('moveend', onMove)
    return () => {
      instance.off('moveend', onMove)
    }
  }, [instance])

  useEffect(() => {
    showPrintFrame(instance, frame)
  }, [instance, frame])
  useEffect(() => () => showPrintFrame(instance, null), [instance])

  // Show the whole printed extent when the settings change.
  const settings = `${paper}:${orientation}:${scale}:${fitted}`
  useEffect(() => {
    const ring = frame.coordinates[0]
    const lngs = ring.map((p) => p[0])
    const lats = ring.map((p) => p[1])
    instance.fitBounds([[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]], { padding: 48, duration: 300 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !step && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, step])

  async function generate() {
    setStep('map')
    try {
      await exportPdf(instance, {
        title: title.trim() || editor.map.name,
        paper,
        orientation,
        scale,
        center,
        hiddenLayers,
        author: currentUser?.name ?? null,
        areaM2: editor.map.areaM2,
        legend: legendEntries(editor.features, hiddenLayers, editor.map.boundary != null),
        sources: attributions(instance),
      }, setStep)
      editor.notify(t('drawing.pdf.done'))
    } catch (error) {
      console.error(error)
      editor.notify(t('drawing.pdf.error'), 'error')
    } finally {
      setStep(null)
    }
  }

  const sheet = (
    <aside
      role="dialog"
      aria-label={t('drawing.pdf.title')}
      className="fixed inset-x-2 bottom-2 z-40 max-h-[75dvh] overflow-y-auto rounded-xl bg-white p-4 shadow-xl ring-1 ring-loam-200 md:inset-x-auto md:bottom-auto md:right-3 md:top-[3.75rem] md:max-h-[calc(100dvh-4.5rem)] md:w-80"
    >
      <div className="flex items-start justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base"><FileText className="h-4 w-4 text-prune-600" />{t('drawing.pdf.title')}</h2>
        <button type="button" onClick={onClose} className="rounded-md p-1 text-loam-500 hover:bg-loam-100" aria-label={t('drawing.toolbar.close')}>
          <X className="h-4 w-4" />
        </button>
      </div>

      {!editor.entitlements.pdfExport ? (
        <div className="mt-3 space-y-3 rounded-lg bg-humus-50 p-3">
          <p className="flex items-center gap-2 text-sm font-semibold text-loam-900"><Lock className="h-4 w-4 text-humus-700" />{t('drawing.pdf.upsell_title')}</p>
          <p className="text-sm text-loam-700">{t('drawing.pdf.upsell')}</p>
          {editor.isOwner
            ? <a href="/billing" className={buttonClass('primary', 'sm', 'w-full')}>{t('drawing.pdf.upgrade')}</a>
            : <p className="text-xs text-loam-500">{t('drawing.pdf.upsell_editor')}</p>}
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          <p className="text-sm text-loam-500">{t('drawing.pdf.intro')}</p>
          <Field label={t('drawing.pdf.plan_title')}>
            <Input value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Segmented label={t('drawing.pdf.paper')} value={paper} onChange={setPaper} options={[{ value: 'A4', label: 'A4' }, { value: 'A3', label: 'A3' }]} />
          <Segmented
            label={t('drawing.pdf.orientation')}
            value={orientation}
            onChange={setOrientation}
            options={[{ value: 'portrait', label: t('drawing.pdf.portrait') }, { value: 'landscape', label: t('drawing.pdf.landscape') }]}
          />
          <Field label={t('drawing.pdf.scale')} hint={scaleChoice === 'fit' && fitted ? t('drawing.pdf.fit_scale', { scale: formatNumber(scale) }) : t('drawing.pdf.move_hint')}>
            <Select value={String(scaleChoice)} onChange={(e) => setScaleChoice(e.target.value === 'fit' ? 'fit' : Number(e.target.value))}>
              {extent && <option value="fit">{t('drawing.pdf.fit')}</option>}
              {SCALES.map((s) => <option key={s} value={s}>1:{formatNumber(s)}</option>)}
            </Select>
          </Field>
          <p className="text-xs text-loam-500">
            {t('drawing.pdf.extent', { width: formatLength(ground.width), height: formatLength(ground.height) })}
          </p>
          {editor.canEdit && (
            <label className="flex items-start gap-2 text-sm text-loam-700">
              <input
                type="checkbox"
                checked={withNetworks}
                onChange={(e) => setWithNetworks(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-loam-300 text-prune-600 focus:ring-prune-500"
              />
              {t('drawing.pdf.include_networks')}
            </label>
          )}
          <Button className="w-full" disabled={step != null} onClick={() => void generate()}>
            {step ? t(step === 'map' ? 'drawing.pdf.rendering' : 'drawing.pdf.writing') : t('drawing.pdf.generate')}
          </Button>
        </div>
      )}
    </aside>
  )
  return createPortal(sheet, document.body)
}
