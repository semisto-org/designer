import { router } from '@inertiajs/react'
import { Sparkles, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { confirmAction } from '@/components/ui/confirm'
import { t } from '@/lib/i18n'
import { formatDate } from '@/lib/money'
import type { TerritoryItem, TerritoryItemUpdate } from '@/types/territories'

const fl = (key: string) => t(`territories.show.fields.${key}`)
const u = (key: string, options?: Record<string, string | number>) => t(`territories.show.updates.${key}`, options)

/** The label of a nested attribute (keeper.role → « Gestionnaire »), keyed like the form's fields. */
const NESTED: Record<string, Record<string, string>> = {
  keeper: { role: 'keeper_role', gestures: 'keeper_gestures', hours_per_year: 'keeper_hours', agreement: 'keeper_agreement', lifespan_years: 'keeper_lifespan' },
  farmer: { contacted_on: 'farmer_contacted_on', answer: 'farmer_answer', note: 'farmer_note' },
  decision: { status: 'decision_status', reason: 'decision_reason', decided_on: 'decision_on' },
}
/** The values group of an attribute that takes one of a list. */
const ENUMS: Record<string, string> = {
  land: 'land', rank: 'rank', theme: 'theme', proof: 'proof', marker_kind: 'marker_kind', source_kind: 'source_kind', rights: 'rights',
  'farmer.answer': 'farmer_answer', 'decision.status': 'decision', request_kind: 'request_kind', state: 'request_state', first_step: 'first_step',
}
const REFS = ['basin_id', 'actor_id', 'source_id', 'source_ids', 'expectation_ids']

export function fieldLabel(field: string) {
  if (field === 'title' || field === 'body' || field === 'geometry') return fl(field)
  const [group, key] = field.replace(/^properties\./, '').split('.')
  if (key) return `${fl(group)} · ${fl(NESTED[group]?.[key] ?? key)}`
  return fl(group === 'order' ? 'basin_order' : group)
}

function describe(field: string, value: unknown, titles: Map<number, string>): string {
  if (value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0)) return u('empty_value')
  if (field === 'geometry') return u('place_changed')
  const key = field.replace(/^properties\./, '')
  if (ENUMS[key]) return t(`territories.show.values.${ENUMS[key]}.${String(value)}`)
  if (REFS.includes(key)) return (Array.isArray(value) ? value : [value]).map((id) => titles.get(Number(id)) ?? `#${id}`).join(' · ')
  if (typeof value === 'boolean') return t(`territories.show.values.boolean.${value}`)
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return formatDate(value)
  if (Array.isArray(value)) return value.join(' · ')
  return String(value)
}

/** A change an AI proposed to a kept entry: the person ticks what they accept, field by field. */
export function UpdateReview({ item, update, territoryId, canEdit, titles }: {
  item: TerritoryItem
  update: TerritoryItemUpdate
  territoryId: number
  canEdit: boolean
  titles: Map<number, string>
}) {
  const [chosen, setChosen] = useState<string[]>(() => update.changes.map((c) => c.field))
  const base = `/territories/${territoryId}/updates/${update.id}`
  const options = { preserveScroll: true }
  const reject = () => router.post(`${base}/reject`, { tab: item.kind }, options)
  const accept = async () => {
    if (update.deletion) {
      if (!(await confirmAction({ title: u('delete_confirm', { title: item.title }), confirmLabel: u('apply_deletion'), tone: 'danger' }))) return
      router.post(`${base}/accept`, { tab: item.kind }, options)
    } else {
      router.post(`${base}/accept`, { tab: item.kind, fields: chosen }, options)
    }
  }

  return (
    <div className="mt-3 rounded-xl bg-humus-50/70 p-3 ring-1 ring-humus-200">
      <p className="flex items-center gap-1.5 text-sm font-medium text-humus-800">
        <Sparkles className="h-4 w-4" aria-hidden />{update.deletion ? u('deletion') : u('pending')}
      </p>
      {!update.deletion && (
        <ul className="mt-2 grid gap-1.5">
          {update.changes.map((change) => (
            <li key={change.field}>
              <label className="flex items-start gap-2 text-sm text-loam-700">
                <input
                  type="checkbox" className="mt-1" disabled={!canEdit} checked={chosen.includes(change.field)}
                  onChange={(e) => setChosen((list) => (e.target.checked ? [...list, change.field] : list.filter((f) => f !== change.field)))}
                />
                <span className="min-w-0">
                  <span className="font-medium text-loam-900">{fieldLabel(change.field)}</span>
                  <span className="block text-loam-500 line-through decoration-loam-300">{describe(change.field, change.before, titles)}</span>
                  <span className="block text-loam-900">{change.field === 'geometry' && change.after === null ? u('place_removed') : describe(change.field, change.after, titles)}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-sm text-loam-700">
        <span className="font-medium text-humus-800">{t('territories.show.drafts.rationale')} : </span>{update.rationale}
      </p>
      {canEdit && (
        <div className="mt-3 flex flex-wrap justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={reject}>{u('reject')}</Button>
          <Button size="sm" variant={update.deletion ? 'danger' : 'primary'} onClick={accept} disabled={!update.deletion && chosen.length === 0}>
            {update.deletion && <Trash2 className="h-4 w-4" aria-hidden />}
            {update.deletion ? u('apply_deletion') : u('apply')}
          </Button>
        </div>
      )}
    </div>
  )
}
