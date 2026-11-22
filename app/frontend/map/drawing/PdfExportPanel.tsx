import { usePage } from '@inertiajs/react'
import { bbox as turfBbox } from '@turf/turf'
import clsx from 'clsx'
import { FileText, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { PlanGate } from '@/components/billing/PlanGate'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select } from '@/components/ui/Field'
import { formatLength, formatNumber, t } from '@/lib/i18n'
import { useEditor } from '@/map/editor/EditorContext'
import {
  attributions, bookSheets, exportPdf, fitScale, frameGeometry, groundSize, legendEntries, pageLayout, SCALES,
  type Orientation, type Paper,
} from '@/map/drawing/pdf'
import { hiddenPlantIds } from '@/map/drawing/hidden'
import { useDrawingState } from '@/map/drawing/store'
import { exportMasterPlan, type MasterLook, type MasterPlanData } from '@/map/drawing/masterPlan'
import { masterLayout } from '@/map/drawing/masterPlanLayout'
import { api } from '@/lib/api'
import { useShownVariant } from '@/map/variants/store'
import { inVariant } from '@/map/variants/variants'
import { inTag } from '@/map/tags/tags'
import { showPrintFrame } from '@/map/drawing/style'
import { usePlanting } from '@/map/plants/store'
import { plantStrata } from '@/map/plants/strata'
import { notePrint } from '@/lib/prints'
import type { BBox, MapFeature, SharedProps } from '@/types'

type Step = { step: 'map' | 'paint' | 'pdf'; page: number; pages: number } | null
/** One plan, a book of sheets, or the « Plan directeur » (numbered, with its legend by theme). */
export type PdfKind = 'plan' | 'book' | 'master'
const PAPERS: Paper[] = ['A4', 'A3']
const MASTER_PAPERS: Paper[] = ['A3', 'A2', 'A1', 'A0']

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
export function PdfExportPanel({ onClose, initialKind = 'plan' }: { onClose: () => void; initialKind?: PdfKind }) {
  const editor = useEditor()
  const { currentUser } = usePage().props as unknown as SharedProps
  const hidden = useDrawingState((s) => s.hiddenLayers)
  // What « Calques » hides inside the layers is left out of the plan too.
  const hiddenKinds = useDrawingState((s) => s.hiddenKinds)
  const hiddenStrata = useDrawingState((s) => s.hiddenStrata)
  const { data: planting } = usePlanting(editor.map.id)
  const hiddenIds = planting ? hiddenPlantIds(editor.features, hiddenStrata, (f) => plantStrata(f as MapFeature, planting)) : []
  const variant = useShownVariant()
  const tag = useDrawingState((s) => s.shownTag)
  const instance = editor.instance
  // The variant (and tag) shown on the map is the one printed, and named in the title.
  const [title, setTitle] = useState([editor.map.name, variant?.name, tag].filter(Boolean).join(' · '))
  // « Carnet de planches »: the overall plan, then one sheet per design layer; « Plan directeur »: numbered.
  const [kind, setKind] = useState<PdfKind>(initialKind)
  const book = kind === 'book'
  const master = kind === 'master'
  const [paper, setPaper] = useState<Paper>(initialKind === 'master' ? 'A3' : 'A4')
  const [orientation, setOrientation] = useState<Orientation>('landscape')
  const [scaleChoice, setScaleChoice] = useState<number | 'fit'>('fit')
  const [withNetworks, setWithNetworks] = useState(false)
  const hasBoundary = editor.map.boundary != null
  const [withBoundary, setWithBoundary] = useState(true)
  const showBoundary = hasBoundary && withBoundary
  const [step, setStep] = useState<Step>(null)
  const [look, setLook] = useState<MasterLook>(() => {
    try {
      return window.localStorage.getItem('designer:master-look') === 'watercolor' ? 'watercolor' : 'plan'
    } catch {
      return 'plan'
    }
  })
  const chooseLook = (next: MasterLook) => {
    setLook(next)
    try {
      window.localStorage.setItem('designer:master-look', next)
    } catch {
      // Blocked storage: the choice lasts for this export.
    }
  }
  const [viewCenter, setViewCenter] = useState<[number, number]>(() => instance.getCenter().toArray() as [number, number])

  // What the plan covers when fitted: the terrain, else everything drawn.
  const extent = useMemo<BBox | null>(() => {
    if (editor.map.bbox) return editor.map.bbox
    const active = editor.features.filter((f) => f.properties.status === 'active')
    if (active.length === 0) return null
    return turfBbox({ type: 'FeatureCollection', features: active }) as BBox
  }, [editor.map.bbox, editor.features])

  const layout = master ? masterLayout(paper, orientation) : pageLayout(paper, orientation)
  const fitted = scaleChoice === 'fit' && extent != null
  const scale = fitted ? fitScale(extent, layout.frame) : scaleChoice === 'fit' ? 500 : scaleChoice
  const center: [number, number] = fitted ? [(extent[0] + extent[2]) / 2, (extent[1] + extent[3]) / 2] : viewCenter
  const frame = useMemo(() => frameGeometry(center, scale, layout.frame), [center[0], center[1], scale, paper, orientation, master]) // eslint-disable-line react-hooks/exhaustive-deps
  const ground = groundSize(scale, layout.frame)
  // The master plan never shows the networks: it is the sheet that goes on the wall and to the client.
  const hiddenLayers = [...new Set([...hidden, ...(withNetworks && editor.canEdit && !master ? [] : ['networks'])])]
  const legend = legendEntries(editor.features, hiddenLayers, showBoundary, variant?.id ?? null, { kinds: hiddenKinds, ids: hiddenIds, tag })
  const sheets = bookSheets(title.trim() || editor.map.name, legend, editor.features, hiddenLayers, variant?.id ?? null, tag)

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

  async function generateMaster() {
    setStep({ step: 'map', page: 1, pages: 1 })
    try {
      const shown = variant?.id ?? null
      const data = await api<MasterPlanData>(`/maps/${editor.map.id}/design/master_plan${shown ? `?variant_id=${shown}` : ''}`)
      // Numbers only what the printed map draws: what « Calques » hides, or an étiquette leaves out, has no number.
      const drawn = new Set(editor.features.filter((f) => !hiddenLayers.includes(f.properties.layer) && inVariant(f.properties, shown) && inTag(f, tag) &&
        !hiddenIds.includes(f.properties.id) && !(f.properties.kind && hiddenKinds.includes(f.properties.kind))).map((f) => f.properties.id))
      let number = 0
      const plan = { ...data, themes: data.themes
        .map((theme) => ({ ...theme, items: theme.items.filter((item) => drawn.has(item.id)).map((item) => ({ ...item, number: ++number })) }))
        .filter((theme) => theme.items.length > 0) }
      await exportMasterPlan(instance, {
        title: title.trim() || editor.map.name,
        paper, orientation, scale, center, hiddenLayers, hiddenKinds, hiddenIds, tag,
        hideBoundary: !showBoundary,
        variant: variant?.id ?? null,
        author: currentUser?.name ?? null,
        sources: attributions(instance),
        url: `${window.location.origin}/maps/${editor.map.id}`,
        look,
      }, plan, (next) => setStep({ step: next, page: 1, pages: 1 }))
      editor.notify(t('drawing.pdf.done'))
      notePrint(editor.map.id, 'pdf')
    } catch (error) {
      console.error(error)
      editor.notify(t('drawing.pdf.error'), 'error')
    } finally {
      setStep(null)
    }
  }

  async function generate() {
    if (master) return generateMaster()
    setStep({ step: 'map', page: 1, pages: book ? sheets.length : 1 })
    try {
      await exportPdf(instance, {
        title: title.trim() || editor.map.name,
        paper,
        orientation,
        scale,
        center,
        hiddenLayers,
        hiddenKinds,
        hiddenIds,
        hideBoundary: !showBoundary,
        variant: variant?.id ?? null,
        tag,
        author: currentUser?.name ?? null,
        areaM2: editor.map.areaM2,
        legend,
        sources: attributions(instance),
        sheets: book ? sheets : undefined,
      }, (next, sheet) => setStep({ step: next, page: sheet?.page ?? 1, pages: sheet?.pages ?? 1 }))
      editor.notify(t('drawing.pdf.done'))
      notePrint(editor.map.id, book ? 'book' : 'pdf')
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
        <PlanGate feature="pdf" place={editor.map} canUpgrade={editor.isOwner} className="mt-3" />
      ) : (
        <div className="mt-3 space-y-3">
          <p className="text-sm text-loam-500">{t('drawing.pdf.intro')}</p>
          <Field label={t('drawing.pdf.plan_title')}>
            <Input value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <div>
            <Segmented
              label={t('drawing.pdf.content')}
              value={kind}
              onChange={(v) => {
                setKind(v)
                const papers = v === 'master' ? MASTER_PAPERS : PAPERS
                if (!papers.includes(paper)) setPaper(papers[0])
              }}
              options={[{ value: 'plan', label: t('drawing.pdf.single') }, { value: 'book', label: t('drawing.pdf.book') }, { value: 'master', label: t('master_plan.option') }]}
            />
            {master && <p className="mt-1 text-sm text-loam-500">{t('master_plan.hint')}</p>}
            {master && (
              <div className="mt-2">
                <Segmented
                  label={t('master_plan.look')}
                  value={look}
                  onChange={chooseLook}
                  options={[{ value: 'plan', label: t('master_plan.look_plan') }, { value: 'watercolor', label: t('master_plan.look_watercolor') }]}
                />
                {look === 'watercolor' && <p className="mt-1 text-sm text-loam-500">{t('master_plan.look_watercolor_hint')}</p>}
              </div>
            )}
            {book && (
              <p className="mt-1 text-sm text-loam-500">
                {sheets.length > 1
                  ? t('drawing.pdf.book_hint', { count: sheets.length, layers: sheets.slice(1).map((s) => t(`editor.layers.${s.theme}`).toLowerCase()).join(', ') })
                  : t('drawing.pdf.book_empty')}
              </p>
            )}
          </div>
          <Segmented label={t('drawing.pdf.paper')} value={paper} onChange={setPaper} options={(master ? MASTER_PAPERS : PAPERS).map((p) => ({ value: p, label: p }))} />
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
          {hasBoundary && (
            <label className="flex items-start gap-2 text-sm text-loam-700">
              <input
                type="checkbox"
                checked={withBoundary}
                onChange={(e) => setWithBoundary(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-loam-300 text-prune-600 focus:ring-prune-500"
              />
              {t('drawing.pdf.include_boundary')}
            </label>
          )}
          {editor.canEdit && !master && (
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
            {step
              ? step.pages > 1
                ? t('drawing.pdf.rendering_sheet', { page: step.page, pages: step.pages })
                : t(step.step === 'map' ? 'drawing.pdf.rendering' : step.step === 'paint' ? 'master_plan.painting' : 'drawing.pdf.writing')
              : t('drawing.pdf.generate')}
          </Button>
        </div>
      )}
    </aside>
  )
  return createPortal(sheet, document.body)
}
