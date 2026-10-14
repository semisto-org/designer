import { Bot, Check, Copy, ExternalLink, FileText, Loader2, Paperclip, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { t } from '@/lib/i18n'
import { useEditor } from '@/map/editor/EditorContext'
import { soilActions } from '@/map/soil/store'
import type { SoilSampleData } from '@/types/soil_photos'

const MAX_REPORTS = 10

function formatSize(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toLocaleString('fr-BE', { maximumFractionDigits: 1 })} Mo` : `${Math.max(1, Math.round(bytes / 1024))} Ko`
}

/**
 * The lab reports of a sampling point, one PDF per analysis (standard,
 * heavy metals…), and the sentence to give the person's own AI so it reads
 * them and proposes the values (MCP get_soil_report, propose_soil_results).
 */
export default function SampleReports({ sample, onError }: { sample: SoilSampleData; onError: (message: string | null) => void }) {
  const editor = useEditor()
  const mapId = editor.map.id
  const canEdit = editor.canEdit
  const [busy, setBusy] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const full = sample.reports.length >= MAX_REPORTS

  async function attach(files: FileList | null) {
    const list = Array.from(files ?? [])
    if (list.length === 0) return
    setBusy(true)
    onError(null)
    try {
      await soilActions.attachReports(mapId, sample.id, list)
      editor.notify(t('soil.sample.reports_added', { count: list.length }))
    } catch (e) {
      onError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function remove(reportId: number, filename: string) {
    if (!window.confirm(t('soil.sample.report_confirm_remove', { name: filename }))) return
    setBusy(true)
    try {
      await soilActions.removeReport(mapId, sample.id, reportId)
    } catch (e) {
      onError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="space-y-2" aria-label={t('soil.sample.reports')}>
      <h4 className="text-sm font-semibold text-loam-800">{t('soil.sample.reports')}</h4>
      {sample.reports.length > 0 ? (
        <ul className="space-y-1.5">
          {sample.reports.map((report) => (
            <li key={report.id} className="flex items-center gap-2 rounded-lg bg-loam-50 px-2.5 py-2 text-sm">
              <FileText className="h-4 w-4 shrink-0 text-loam-500" aria-hidden />
              <a
                href={`/maps/${mapId}/soil_samples/${sample.id}/reports/${report.id}`} target="_blank" rel="noreferrer"
                className="min-w-0 flex-1 truncate text-loam-900 hover:text-prune-700 hover:underline" title={report.filename}
              >
                {report.filename}
              </a>
              <span className="shrink-0 text-sm text-loam-500">{formatSize(report.byteSize)}</span>
              <a
                href={`/maps/${mapId}/soil_samples/${sample.id}/reports/${report.id}`} target="_blank" rel="noreferrer"
                className="rounded p-1 text-loam-500 hover:bg-white hover:text-prune-700" aria-label={`${t('soil.sample.report_open')} : ${report.filename}`}
              >
                <ExternalLink className="h-4 w-4" aria-hidden />
              </a>
              {canEdit && (
                <button
                  type="button" onClick={() => remove(report.id, report.filename)} disabled={busy}
                  className="rounded p-1 text-clay-500 hover:bg-white" aria-label={`${t('soil.sample.report_remove')} : ${report.filename}`}
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-loam-500">{t('soil.sample.reports_none')}</p>
      )}
      {canEdit && (
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="secondary" onClick={() => input.current?.click()} disabled={busy || full}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Paperclip className="h-4 w-4" aria-hidden />}
            {busy ? t('soil.sample.report_uploading') : sample.reports.length > 0 ? t('soil.sample.report_add_more') : t('soil.sample.report_add')}
          </Button>
          <span className="text-sm text-loam-500">{full ? t('soil.sample.reports_full', { max: MAX_REPORTS }) : t('soil.sample.reports_hint')}</span>
          <input
            ref={input} type="file" multiple accept="application/pdf,.pdf" className="sr-only" aria-label={t('soil.sample.report_add')}
            onChange={(e) => { attach(e.target.files); e.target.value = '' }}
          />
        </div>
      )}
      {canEdit && sample.reports.length > 0 && !sample.draft && <AskYourAi sample={sample} />}
    </section>
  )
}

/** The sentence to say to the person's AI, to read the reports and propose the values. */
function AskYourAi({ sample }: { sample: SoilSampleData }) {
  const editor = useEditor()
  const [copied, setCopied] = useState(false)
  const prompt = t('soil.sample.ai.prompt', { label: sample.label, map: editor.map.name ?? '' })

  async function copy() {
    try {
      await navigator.clipboard.writeText(prompt)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="space-y-2 rounded-lg bg-prune-50 p-3">
      <p className="flex items-center gap-1.5 text-sm font-semibold text-loam-800">
        <Bot className="h-4 w-4 text-prune-600" aria-hidden />{t('soil.sample.ai.title')}
      </p>
      <p className="text-sm text-loam-700">{t('soil.sample.ai.intro')}</p>
      <p className="rounded-lg bg-white p-2.5 text-sm text-loam-900 ring-1 ring-prune-100">« {prompt} »</p>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button size="sm" variant="secondary" onClick={copy}>
          {copied ? <Check className="h-4 w-4 text-leaf-600" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
          {copied ? t('soil.plants.ai.copied') : t('soil.plants.ai.copy')}
        </Button>
        <a href="/account/ai" className="text-sm font-medium text-prune-700 hover:underline" title={t('soil.plants.ai.connect')}>{t('soil.plants.ai.connect_link')}</a>
      </div>
    </div>
  )
}
