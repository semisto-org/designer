import clsx from 'clsx'
import { Droplet, Pencil, Plus, Trash2 } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Field, Input, Textarea } from '@/components/ui/Field'
import { api } from '@/lib/api'
import { t } from '@/lib/i18n'
import { useEditor } from '@/map/editor/EditorContext'
import { setWaterSources, useWaterSources, type WaterSource, type WaterSourcesResponse } from '@/map/water/store'

type Draft = { name: string; potable: boolean; notes: string }

const emptyDraft: Draft = { name: '', potable: false, notes: '' }

/** Badge « Potable » / « Non potable ». */
export function PotableBadge({ potable }: { potable: boolean }) {
  return (
    <span className={clsx('rounded-full px-2 py-0.5 text-xs font-medium', potable ? 'bg-leaf-100 text-leaf-800' : 'bg-humus-100 text-humus-800')}>
      {t(potable ? 'water_sources.potable_short' : 'water_sources.not_potable_short')}
    </span>
  )
}

function SourceForm({ initial, submitLabel, busy, onSubmit, onCancel }: {
  initial: Draft; submitLabel: string; busy: boolean; onSubmit: (draft: Draft) => void; onCancel: () => void
}) {
  const [draft, setDraft] = useState(initial)
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (draft.name.trim()) onSubmit(draft)
  }
  return (
    <form onSubmit={submit} className="space-y-2.5 rounded-xl bg-loam-50 p-3">
      <Field label={t('water_sources.name')}>
        <Input
          autoFocus
          required
          maxLength={80}
          placeholder={t('water_sources.name_placeholder')}
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
        />
      </Field>
      <label className="flex items-center justify-between gap-3 text-sm text-loam-700">
        {t('water_sources.potable')}
        <input
          type="checkbox"
          checked={draft.potable}
          onChange={(e) => setDraft({ ...draft, potable: e.target.checked })}
          className="h-4 w-4 rounded border-loam-300 text-prune-600 focus:ring-prune-500"
        />
      </label>
      <Field label={t('water_sources.notes')}>
        <Textarea
          rows={2}
          maxLength={2000}
          placeholder={t('water_sources.notes_placeholder')}
          value={draft.notes}
          onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
        />
      </Field>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>{t('water_sources.cancel')}</Button>
        <Button type="submit" size="sm" disabled={busy || !draft.name.trim()}>{submitLabel}</Button>
      </div>
    </form>
  )
}

/**
 * « Sources d'eau »: where the map's water comes from (well, rain, forest
 * catchment…) and whether each is drinkable. Taps are linked to a source in
 * their inspector and take its potability.
 */
export default function WaterSourcesPanel() {
  const editor = useEditor()
  const mapId = editor.map.id
  const { sources, error } = useWaterSources(mapId)
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)

  async function write(path: string, method: string, body?: unknown): Promise<boolean> {
    setBusy(true)
    try {
      const data = await api<WaterSourcesResponse>(path, { method, body })
      setWaterSources(mapId, data.sources)
      if (data.features?.length) editor.upsertFeatures(data.features)
      return true
    } catch (e) {
      editor.notify((e as Error).message, 'error')
      return false
    } finally {
      setBusy(false)
    }
  }

  const payload = (draft: Draft) => ({ water_source: { name: draft.name.trim(), potable: draft.potable, notes: draft.notes } })

  async function create(draft: Draft) {
    if (await write(`/maps/${mapId}/water_sources`, 'POST', payload(draft))) setAdding(false)
  }

  async function update(source: WaterSource, draft: Draft) {
    if (await write(`/maps/${mapId}/water_sources/${source.id}`, 'PATCH', payload(draft))) setEditingId(null)
  }

  function togglePotable(source: WaterSource) {
    void write(`/maps/${mapId}/water_sources/${source.id}`, 'PATCH', { water_source: { potable: !source.potable } })
  }

  function remove(source: WaterSource) {
    if (!window.confirm(t('water_sources.delete_confirm', { name: source.name }))) return
    void write(`/maps/${mapId}/water_sources/${source.id}`, 'DELETE')
  }

  if (error) return <p className="text-sm text-clay-700">{t('water_sources.load_error')}</p>
  if (!sources) return null

  return (
    <div className="space-y-4">
      {editor.canEdit && <p className="text-sm text-loam-600">{t('water_sources.intro')}</p>}

      {sources.length === 0 && !adding && (
        <p className="text-sm text-loam-500">{t(editor.canEdit ? 'water_sources.empty' : 'water_sources.empty_readonly')}</p>
      )}

      {sources.length > 0 && (
        <ul className="divide-y divide-loam-100">
          {sources.map((source) => (
            <li key={source.id} className="py-2.5">
              {editingId === source.id ? (
                <SourceForm
                  initial={{ name: source.name, potable: source.potable, notes: source.notes ?? '' }}
                  submitLabel={t('water_sources.save')}
                  busy={busy}
                  onSubmit={(draft) => void update(source, draft)}
                  onCancel={() => setEditingId(null)}
                />
              ) : (
                <div className="flex items-start gap-2.5">
                  <Droplet className={clsx('mt-0.5 h-4 w-4 shrink-0', source.potable ? 'text-leaf-600' : 'text-humus-600')} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-loam-900">{source.name}</span>
                      {editor.canEdit ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => togglePotable(source)}
                          aria-pressed={source.potable}
                          aria-label={t('water_sources.potable')}
                          className="rounded-full focus-visible:outline-2 focus-visible:outline-prune-600"
                        >
                          <PotableBadge potable={source.potable} />
                        </button>
                      ) : (
                        <PotableBadge potable={source.potable} />
                      )}
                    </div>
                    <p className="text-xs text-loam-500">{t('water_sources.tap_count', { count: source.tapCount })}</p>
                    {source.notes && <p className="mt-1 whitespace-pre-line text-xs text-loam-600">{source.notes}</p>}
                  </div>
                  {editor.canEdit && (
                    <div className="flex shrink-0 gap-0.5">
                      <button type="button" onClick={() => setEditingId(source.id)} aria-label={t('water_sources.rename')} title={t('water_sources.rename')} className="rounded-full p-1.5 text-loam-500 hover:bg-loam-100 hover:text-loam-800">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" disabled={busy} onClick={() => remove(source)} aria-label={t('water_sources.delete')} title={t('water_sources.delete')} className="rounded-full p-1.5 text-loam-500 hover:bg-clay-50 hover:text-clay-700">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {editor.canEdit && (adding ? (
        <SourceForm initial={emptyDraft} submitLabel={t('water_sources.add_submit')} busy={busy} onSubmit={(draft) => void create(draft)} onCancel={() => setAdding(false)} />
      ) : (
        <Button variant="secondary" size="sm" className="w-full" onClick={() => { setAdding(true); setEditingId(null) }}>
          <Plus className="h-4 w-4" />
          {t('water_sources.add')}
        </Button>
      ))}
    </div>
  )
}
