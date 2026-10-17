import { AlertTriangle, Hourglass, Trash2, Upload, X } from 'lucide-react'
import { useRef, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Field, Input } from '@/components/ui/Field'
import { fileDay, formatBytes } from '@/drone/files'
import { aerialViewLabel } from '@/drone/format'
import { importsStore, useImports } from '@/drone/imports'
import { t } from '@/lib/i18n'
import type { AerialImport } from '@/types/drone'

// Matches AerialView::MAX_UPLOAD_BYTES and UPLOAD_EXTENSIONS.
export const MAX_UPLOAD_GB = 10
const ACCEPT = '.tif,.tiff,.mbtiles,.pmtiles'

/**
 * « Importer une vue drone » for whoever edits the map: the button, the
 * dialog that asks for the file, its name and the day of the flight, and
 * the list of imports with their progress (sent, being prepared, failed).
 */
export function AerialImports({ empty }: { empty: boolean }) {
  const { imports, sending, error } = useImports()
  const [open, setOpen] = useState(false)
  const pending = imports.filter((v) => v.status !== 'ready')
  const ready = imports.filter((v) => v.status === 'ready')

  return (
    <div className="mt-3 space-y-3">
      {empty && !sending && pending.length === 0 && <p className="text-sm text-loam-600">{t('drone.import.intro_empty')}</p>}
      {sending && <SendingCard />}
      {error && (
        <p className="flex items-start gap-1.5 rounded-lg bg-clay-50 px-3 py-2 text-sm text-clay-700" role="alert">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="flex-1">{error}</span>
          <button type="button" onClick={() => importsStore.clearError()} className="rounded p-0.5 hover:bg-clay-100" aria-label={t('drone.import.close')}>
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </p>
      )}
      {pending.filter((v) => v.id !== sending?.viewId).map((view) => <PendingCard key={view.id} view={view} />)}
      {!sending && (
        <Button variant="secondary" size="sm" onClick={() => setOpen(true)} className="w-full justify-center">
          <Upload className="h-4 w-4" aria-hidden="true" />
          {t('drone.import.button')}
        </Button>
      )}
      {ready.length > 0 && (
        <details className="text-sm text-loam-600">
          <summary className="cursor-pointer select-none py-1 text-loam-600 hover:text-loam-800">{t('drone.import.list_title')} ({ready.length})</summary>
          <ul className="mt-1 space-y-1">
            {ready.map((view) => (
              <li key={view.id} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate" title={view.filename}>{aerialViewLabel(view)}</span>
                <RemoveButton view={view} />
              </li>
            ))}
          </ul>
        </details>
      )}
      <ImportDialog open={open} onClose={() => setOpen(false)} />
    </div>
  )
}

function SendingCard() {
  const { sending } = useImports()
  if (!sending) return null
  const percent = sending.total > 0 ? Math.floor((sending.sent / sending.total) * 100) : 0
  return (
    <div className="rounded-lg bg-prune-50 px-3 py-2.5 text-sm text-prune-900 ring-1 ring-inset ring-prune-200" role="status">
      <p className="truncate font-medium" title={sending.filename}>{sending.filename}</p>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-prune-100" aria-hidden="true">
        <div className="h-full rounded-full bg-prune-600 transition-[width] duration-500" style={{ width: `${percent}%` }} />
      </div>
      <p className="mt-1.5">{t('drone.import.sending', { percent, sent: formatBytes(sending.sent), total: formatBytes(sending.total) })}</p>
      <p className="mt-1 text-prune-700">{t('drone.import.keep_open')}</p>
      <button type="button" onClick={() => importsStore.cancel()} className="mt-1.5 text-sm font-medium text-prune-700 underline underline-offset-2 hover:text-prune-900">
        {t('drone.import.cancel')}
      </button>
    </div>
  )
}

function PendingCard({ view }: { view: AerialImport }) {
  const failed = view.status === 'failed'
  // A view still "uploading" without a file on its way here was left half-sent.
  const message = failed
    ? t(`drone.import.failures.${view.failure ?? 'conversion_failed'}`)
    : view.status === 'uploading' ? t('drone.import.uploading_stale') : t('drone.import.processing_hint')
  return (
    <div className={failed ? 'rounded-lg bg-clay-50 px-3 py-2.5 text-sm text-clay-800 ring-1 ring-inset ring-clay-200' : 'rounded-lg bg-loam-50 px-3 py-2.5 text-sm text-loam-700 ring-1 ring-inset ring-loam-200'}>
      <div className="flex items-start gap-2">
        {failed ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> : <Hourglass className="mt-0.5 h-4 w-4 shrink-0 text-loam-500" aria-hidden="true" />}
        <div className="min-w-0 flex-1">
          <p className="font-medium">{aerialViewLabel(view)} · {t(`drone.import.statuses.${view.status}`)}</p>
          <p className="truncate text-loam-500" title={view.filename}>{t('drone.import.file_line', { file: view.filename, size: formatBytes(view.byteSize) })}</p>
          <p className="mt-1">{message}</p>
        </div>
        {view.status !== 'processing' && <RemoveButton view={view} />}
      </div>
    </div>
  )
}

function RemoveButton({ view }: { view: AerialImport }) {
  const [busy, setBusy] = useState(false)
  const remove = async () => {
    if (!window.confirm(t('drone.import.confirm_remove', { name: aerialViewLabel(view) }))) return
    setBusy(true)
    try {
      await importsStore.remove(view.id)
    } finally {
      setBusy(false)
    }
  }
  return (
    <button type="button" onClick={remove} disabled={busy} className="shrink-0 rounded-md p-1.5 text-loam-500 hover:bg-loam-100 hover:text-clay-700 disabled:opacity-50" aria-label={`${t('drone.import.remove')} « ${aerialViewLabel(view)} »`} title={t('drone.import.remove')}>
      <Trash2 className="h-4 w-4" aria-hidden="true" />
    </button>
  )
}

function ImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const input = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [name, setName] = useState(() => t('drone.default_name'))
  const [capturedOn, setCapturedOn] = useState('')
  const [error, setError] = useState<string | null>(null)

  const pick = (picked: File | null) => {
    setError(null)
    if (!picked) return
    const extension = picked.name.slice(picked.name.lastIndexOf('.')).toLowerCase()
    if (!ACCEPT.split(',').includes(extension)) return setError(t('drone.import.errors.format'))
    if (picked.size > MAX_UPLOAD_GB * 1024 ** 3) return setError(t('drone.import.errors.too_large', { max: MAX_UPLOAD_GB }))
    setFile(picked)
    setCapturedOn(fileDay(picked))
  }

  const close = () => {
    setFile(null)
    setError(null)
    onClose()
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!file) return setError(t('drone.import.errors.no_file'))
    // The file travels in the background: the dialog closes, the panel shows the progress.
    void importsStore.start(file, { name: name.trim() || t('drone.default_name'), capturedOn })
    close()
  }

  return (
    <Dialog open={open} onClose={close} title={t('drone.import.title')} dismissOnBackdrop={false}
      footer={<>
        <Button variant="ghost" onClick={close}>{t('drone.import.cancel')}</Button>
        <Button type="submit" form="aerial-import-form" disabled={!file}>{t('drone.import.submit')}</Button>
      </>}>
      <form id="aerial-import-form" onSubmit={submit} className="space-y-4">
        <div className="space-y-1">
          <span className="block text-sm font-medium text-loam-700">{t('drone.import.file')}</span>
          <input ref={input} type="file" accept={ACCEPT} className="sr-only" onChange={(e) => pick(e.target.files?.[0] ?? null)} />
          {file ? (
            <div className="flex items-center gap-3 rounded-lg bg-loam-50 px-3 py-2 text-sm ring-1 ring-inset ring-loam-200">
              <span className="min-w-0 flex-1 truncate font-medium text-loam-800" title={file.name}>{file.name}</span>
              <span className="shrink-0 text-loam-500">{formatBytes(file.size)}</span>
              <button type="button" onClick={() => input.current?.click()} className="shrink-0 font-medium text-prune-700 underline underline-offset-2">{t('drone.import.change')}</button>
            </div>
          ) : (
            <Button variant="secondary" onClick={() => input.current?.click()}>
              <Upload className="h-4 w-4" aria-hidden="true" />
              {t('drone.import.choose')}
            </Button>
          )}
          {error ? <span className="block text-sm text-clay-600">{error}</span> : <span className="block text-sm text-loam-500">{t('drone.import.file_hint', { max: MAX_UPLOAD_GB })}</span>}
        </div>
        <Field label={t('drone.import.name')}>
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required />
        </Field>
        <Field label={t('drone.import.captured_on')} hint={t('drone.import.captured_on_hint')}>
          <Input type="date" value={capturedOn} onChange={(e) => setCapturedOn(e.target.value)} required />
        </Field>
      </form>
    </Dialog>
  )
}
