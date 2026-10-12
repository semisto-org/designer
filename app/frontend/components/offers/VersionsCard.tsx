import { Link } from '@inertiajs/react'
import { History } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input, Select } from '@/components/ui/Field'
import { api } from '@/lib/api'
import { t } from '@/lib/i18n'
import type { OfferVersionSummary } from '@/types/offers'
import { euros, SectionTitle } from './shared'

const STATUSES: OfferVersionSummary['status'][] = ['saved', 'sent', 'accepted', 'declined']
const dateFormat = new Intl.DateTimeFormat('fr-BE', { day: 'numeric', month: 'long', year: 'numeric' })

type Props = {
  mapId: number
  versions: OfferVersionSummary[]
  readOnly: boolean
  /** Saves the working offer before a version is taken from it. */
  beforeSave: () => Promise<void>
  onVersions: (versions: OfferVersionSummary[]) => void
  onRestore: (number: number) => Promise<void>
  notify: (message: string) => void
}

/**
 * V1, V2…: each saved version keeps its inputs, the map's measures and the
 * budget as they were, so what was sent to the client never moves.
 */
export function VersionsCard({ mapId, versions, readOnly, beforeSave, onVersions, onRestore, notify }: Props) {
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const next = (versions.reduce((max, version) => Math.max(max, version.number), 0)) + 1
  const base = `/maps/${mapId}/offer/versions`

  async function save() {
    setBusy(true)
    try {
      await beforeSave()
      const data = await api<{ versions: OfferVersionSummary[] }>(base, { method: 'POST', body: { note: note.trim() || null } })
      onVersions(data.versions)
      setNote('')
      notify(t('offers.versions.saved', { number: next }))
    } catch (error) {
      notify((error as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function setStatus(number: number, status: string) {
    try {
      const data = await api<{ versions: OfferVersionSummary[] }>(`${base}/${number}`, { method: 'PATCH', body: { version: { status } } })
      onVersions(data.versions)
    } catch (error) {
      notify((error as Error).message)
    }
  }

  async function restore(number: number) {
    if (!window.confirm(t('offers.versions.restore_confirm', { number }))) return
    await onRestore(number)
  }

  const ordered = [...versions].sort((a, b) => b.number - a.number)

  return (
    <Card className="space-y-4">
      <SectionTitle title={t('offers.versions.title')} />
      {ordered.length === 0 ? (
        <p className="text-sm text-loam-500">{t('offers.versions.empty')}</p>
      ) : (
        <ul className="space-y-2">
          {ordered.map((version) => (
            <li key={version.number} className="rounded-xl bg-loam-50 p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Link href={`${base}/${version.number}`} className="font-serif text-lg font-semibold text-prune-800 hover:underline">{version.label}</Link>
                <span className="tabular-nums font-medium">{euros(version.totalTvac)}</span>
              </div>
              <p className="text-xs text-loam-500">
                {dateFormat.format(new Date(version.createdAt))}
                {version.createdBy && ` · ${t('offers.versions.by', { name: version.createdBy })}`}
              </p>
              {version.note && <p className="mt-1 text-loam-700">{version.note}</p>}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <label className="w-36">
                  <span className="sr-only">{t('offers.versions.status')}</span>
                  <Select value={version.status} disabled={readOnly} onChange={(e) => void setStatus(version.number, e.target.value)}>
                    {STATUSES.map((status) => <option key={status} value={status}>{t(`offers.statuses.${status}`)}</option>)}
                  </Select>
                </label>
                <Link href={`${base}/${version.number}`} className="rounded-full px-3 py-1.5 text-sm font-medium text-prune-700 hover:bg-prune-50">{t('offers.versions.open')}</Link>
                {!readOnly && (
                  <button type="button" onClick={() => void restore(version.number)} className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-sm text-loam-600 hover:bg-loam-100">
                    <History className="h-3.5 w-3.5" aria-hidden />{t('offers.versions.restore')}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {!readOnly && (
        <div className="space-y-2 border-t border-loam-100 pt-3">
          <Input value={note} maxLength={200} placeholder={t('offers.versions.note_placeholder')} onChange={(e) => setNote(e.target.value)} aria-label={t('offers.versions.note_placeholder')} />
          <Button size="sm" onClick={() => void save()} disabled={busy}>{t('offers.versions.save', { number: next })}</Button>
        </div>
      )}
    </Card>
  )
}
