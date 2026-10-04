import { Download, FileJson, FileText, Network } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { t } from '@/lib/i18n'
import { useEditor } from '@/map/editor/EditorContext'
import { PdfExportPanel } from '@/map/drawing/PdfExportPanel'

function MenuItem({ icon: Icon, label, hint, badge, href, onClick }: {
  icon: typeof Download; label: string; hint: string; badge?: string; href?: string; onClick?: () => void
}) {
  const body = (
    <>
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-loam-500" />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 font-medium text-loam-900">
          {label}
          {badge && <span className="rounded-full bg-humus-100 px-1.5 py-0.5 text-[11px] font-semibold text-humus-700">{badge}</span>}
        </span>
        <span className="block text-xs text-loam-500">{hint}</span>
      </span>
    </>
  )
  const className = 'flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-loam-100'
  if (href) {
    return <a role="menuitem" href={href} download className={className} onClick={onClick}>{body}</a>
  }
  return <button role="menuitem" type="button" className={className} onClick={onClick}>{body}</button>
}

/**
 * "Exporter" in the editor's top bar: the plan at scale (PDF, paid plans)
 * and the GeoJSON of the design. Sensitive networks stay out unless an
 * editor asks for them explicitly.
 */
export default function ExportMenu() {
  const editor = useEditor()
  const [open, setOpen] = useState(false)
  const [pdfOpen, setPdfOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const geojson = `/maps/${editor.map.id}/export.geojson`

  useEffect(() => {
    if (!open) return
    const onPointer = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setOpen(false)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={t('drawing.export.button')}
        className="flex h-8 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-loam-700 ring-1 ring-inset ring-loam-200 hover:bg-loam-100"
      >
        <Download className="h-4 w-4" />
        <span className="hidden sm:inline">{t('drawing.export.button')}</span>
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-50 mt-2 w-72 max-w-[calc(100vw-1rem)] rounded-xl bg-white p-1.5 shadow-xl ring-1 ring-loam-200">
          <MenuItem
            icon={FileText}
            label={t('drawing.export.pdf')}
            hint={t('drawing.export.pdf_hint')}
            badge={editor.entitlements.pdfExport ? undefined : t('drawing.export.paid')}
            onClick={() => {
              setOpen(false)
              setPdfOpen(true)
            }}
          />
          <MenuItem icon={FileJson} label={t('drawing.export.geojson')} hint={t('drawing.export.geojson_hint')} href={geojson} onClick={() => setOpen(false)} />
          {editor.canEdit && (
            <MenuItem
              icon={Network}
              label={t('drawing.export.geojson_networks')}
              hint={t('drawing.export.geojson_networks_hint')}
              href={`${geojson}?networks=1`}
              onClick={() => setOpen(false)}
            />
          )}
        </div>
      )}
      {pdfOpen && <PdfExportPanel onClose={() => setPdfOpen(false)} />}
    </div>
  )
}
