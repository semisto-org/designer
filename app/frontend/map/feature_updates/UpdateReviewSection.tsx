import { Check, History, PencilLine, SlidersHorizontal, Trash2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Field, Input, Textarea } from '@/components/ui/Field'
import { api } from '@/lib/api'
import { t } from '@/lib/i18n'
import { useEditor } from '@/map/editor/EditorContext'
import ChangeList, { fieldLabel } from '@/map/feature_updates/ChangeList'
import { adjustable, adjustedChanges, inputValue, isDeletion, type FeatureUpdateData, type FeatureUpdateHistoryEntry } from '@/map/feature_updates/diff'
import { acceptUpdate, rejectUpdate, useFeatureUpdates } from '@/map/feature_updates/store'
import type { MapFeature } from '@/types'

const formatDate = (iso: string) => new Intl.DateTimeFormat('fr-BE', { dateStyle: 'long' }).format(new Date(iso))

/**
 * In the inspector of an element: the change an AI proposed to it, field by
 * field with its reason (accept, adjust then accept, or reject), and the
 * changes already reviewed, which are the element's history.
 */
export default function UpdateReviewSection({ feature }: { feature: MapFeature }) {
  const id = feature.properties.id
  const { updates } = useFeatureUpdates()
  const pending = updates.find((u) => u.featureId === id)
  const history = useHistory(id, pending?.id)

  if (!pending && history.length === 0) return null
  return (
    <div className="space-y-3">
      {pending && <PendingUpdate key={pending.id} update={pending} />}
      {history.length > 0 && <HistoryList entries={history} />}
    </div>
  )
}

// Reloaded when the element changes or its pending change is reviewed.
function useHistory(featureId: number, pendingId: number | undefined) {
  const editor = useEditor()
  const [entries, setEntries] = useState<FeatureUpdateHistoryEntry[]>([])
  useEffect(() => {
    let alive = true
    api<{ history: FeatureUpdateHistoryEntry[] }>(`/maps/${editor.map.id}/feature_updates?feature_id=${featureId}`)
      .then((data) => alive && setEntries(data.history))
      .catch(() => alive && setEntries([]))
    return () => { alive = false }
  }, [editor.map.id, featureId, pendingId])
  return entries
}

function PendingUpdate({ update }: { update: FeatureUpdateData }) {
  const editor = useEditor()
  const [busy, setBusy] = useState(false)
  const [typed, setTyped] = useState<Record<string, string> | null>(null)
  const author = update.clientName || t('feature_updates.default_author')
  const fields = update.changes.filter(adjustable)
  const deletion = isDeletion(update)

  async function run(action: () => Promise<void>, message: string) {
    setBusy(true)
    try {
      await action()
      editor.notify(message)
    } catch (error) {
      editor.notify((error as Error).message, 'error')
      setBusy(false)
    }
  }

  return (
    <div className={deletion ? 'space-y-2 rounded-lg border border-clay-200 bg-clay-50/60 p-3' : 'space-y-2 rounded-lg border border-humus-200 bg-humus-50/60 p-3'}>
      <p className={deletion ? 'flex items-center gap-1.5 text-sm font-semibold text-clay-700' : 'flex items-center gap-1.5 text-sm font-semibold text-humus-800'}>
        {deletion ? <Trash2 className="h-4 w-4" /> : <PencilLine className="h-4 w-4" />}
        {t(deletion ? 'feature_updates.deletion_title' : 'feature_updates.inspector_title', { author })}
      </p>
      {update.summary && <p className="text-sm text-loam-600">{update.summary}</p>}
      {deletion ? (
        <p className="text-sm text-loam-600">{t('feature_updates.deletion_hint')}</p>
      ) : typed ? (
        <div className="space-y-2">
          <p className="text-sm text-loam-600">{t('feature_updates.adjust_hint')}</p>
          {fields.map((change) => (
            <Field key={change.field} label={fieldLabel(change.field)}>
              {change.field === 'notes' ? (
                <Textarea rows={3} value={typed[change.field] ?? ''} onChange={(e) => setTyped({ ...typed, [change.field]: e.target.value })} />
              ) : (
                <Input
                  type={change.field.endsWith('_on') ? 'date' : 'text'}
                  value={typed[change.field] ?? ''}
                  onChange={(e) => setTyped({ ...typed, [change.field]: e.target.value })}
                />
              )}
            </Field>
          ))}
        </div>
      ) : (
        <ChangeList changes={update.changes} />
      )}
      <div className="rounded-md bg-white/70 p-2 text-sm text-loam-700">
        <span className="font-medium">{t('feature_updates.rationale')} : </span>
        <span className="whitespace-pre-line">{update.rationale}</span>
      </div>
      {editor.canEdit && (
        typed ? (
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="leaf"
              className="flex-1"
              disabled={busy}
              onClick={() => run(() => acceptUpdate(editor, update.id, adjustedChanges(update.changes, typed)), t('feature_updates.accepted'))}
            >
              <Check className="h-4 w-4" />
              {t('feature_updates.accept_adjusted')}
            </Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => setTyped(null)}>
              {t('feature_updates.cancel_adjust')}
            </Button>
          </div>
        ) : deletion ? (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="danger" className="flex-1" disabled={busy} onClick={() => run(() => acceptUpdate(editor, update.id), t('feature_updates.deleted'))}>
              <Trash2 className="h-4 w-4" />
              {t('feature_updates.delete')}
            </Button>
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => run(() => rejectUpdate(editor, update.id), t('feature_updates.kept'))}>
              <X className="h-4 w-4" />
              {t('feature_updates.keep')}
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="leaf" className="flex-1" disabled={busy} onClick={() => run(() => acceptUpdate(editor, update.id), t('feature_updates.accepted'))}>
              <Check className="h-4 w-4" />
              {t('feature_updates.accept')}
            </Button>
            {fields.length > 0 && (
              <Button
                size="sm"
                variant="secondary"
                disabled={busy}
                onClick={() => setTyped(Object.fromEntries(fields.map((c) => [c.field, inputValue(c)])))}
              >
                <SlidersHorizontal className="h-4 w-4" />
                {t('feature_updates.adjust')}
              </Button>
            )}
            <Button size="sm" variant="secondary" className="text-clay-500" disabled={busy} onClick={() => run(() => rejectUpdate(editor, update.id), t('feature_updates.rejected'))}>
              <X className="h-4 w-4" />
              {t('feature_updates.reject')}
            </Button>
          </div>
        )
      )}
    </div>
  )
}

function HistoryList({ entries }: { entries: FeatureUpdateHistoryEntry[] }) {
  return (
    <details className="rounded-lg ring-1 ring-loam-100">
      <summary className="flex cursor-pointer items-center gap-1.5 px-3 py-2 text-sm font-medium text-loam-700 hover:bg-loam-50">
        <History className="h-4 w-4 text-loam-400" />
        {t('feature_updates.history.title')} · {entries.length}
      </summary>
      <ol className="space-y-3 px-3 pb-3 pt-1">
        {entries.map((entry) => {
          const name = entry.reviewerName || t('feature_updates.history.someone')
          const date = entry.reviewedAt ? formatDate(entry.reviewedAt) : ''
          const verdict = entry.status === 'rejected' ? 'rejected' : entry.adjusted ? 'accepted_adjusted' : 'accepted'
          return (
            <li key={entry.id} className="space-y-1 border-l-2 border-humus-200 pl-2">
              <p className={entry.status === 'rejected' ? 'text-sm text-clay-500' : 'text-sm text-leaf-700'}>
                {t(`feature_updates.history.${verdict}`, { name, date })}
              </p>
              <ChangeList changes={entry.changes} compact />
              <p className="text-sm text-loam-500">
                {t('feature_updates.history.proposed_by', { author: entry.clientName || t('feature_updates.default_author') })} · {entry.rationale}
              </p>
            </li>
          )
        })}
      </ol>
    </details>
  )
}
