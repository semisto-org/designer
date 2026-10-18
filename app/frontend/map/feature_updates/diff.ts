// Pure helpers for the review of the changes an AI proposed to elements
// already on the map (Maps::FeatureUpdatesController). No React, no i18n:
// the components turn these into words, and test/frontend tests them.

/** One field of a proposed change, before → after (`properties.planted_on`, `name`…). */
export type FeatureUpdateChange = {
  field: string
  before?: unknown
  after?: unknown
  beforeLabel?: string
  afterLabel?: string
}

export type ProposedChanges = {
  name?: string | null
  notes?: string | null
  tags?: string[]
  properties?: Record<string, unknown>
  geometry?: unknown
}

export type FeatureUpdateData = {
  id: number
  featureId: number
  batch: string
  summary: string | null
  rationale: string
  status: 'pending' | 'accepted' | 'rejected' | 'withdrawn'
  clientName: string | null
  authorName: string | null
  changes: FeatureUpdateChange[]
  proposedChanges: ProposedChanges
  createdAt: string
}

export type FeatureUpdateBatch = {
  batch: string
  summary: string | null
  clientName: string | null
  count: number
  createdAt: string
}

export type FeatureUpdatesResponse = { updates: FeatureUpdateData[]; batches: FeatureUpdateBatch[] }

export type FeatureUpdateHistoryEntry = {
  id: number
  status: 'accepted' | 'rejected'
  rationale: string
  summary: string | null
  clientName: string | null
  authorName: string | null
  reviewerName: string | null
  reviewedAt: string | null
  createdAt: string
  adjusted: boolean
  changes: FeatureUpdateChange[]
}

/** Fields the review names in words (feature_updates.fields.*). */
export const KNOWN_FIELDS = ['name', 'notes', 'tags', 'geometry', 'planted_on', 'species_id', 'variety_id', 'training', 'graft_form', 'trunk_height', 'rootstock_vigor', 'rootstock', 'count', 'number', 'planted_on_precision'] as const

/** `properties.planted_on` → `planted_on`; `name` → `name`. */
export function fieldKey(field: string): string {
  return field.startsWith('properties.') ? field.slice('properties.'.length) : field
}

export function isKnownField(key: string): boolean {
  return (KNOWN_FIELDS as readonly string[]).includes(key)
}

const DATE = /^\d{4}-\d{2}-\d{2}$/

/**
 * What to show for one side of a change: nothing (empty), a position
 * (geometry), or text. Dates read the French way, lists are joined, catalogue
 * ids show the name the server attached.
 */
export type ShownValue = { kind: 'empty' } | { kind: 'geometry' } | { kind: 'text'; text: string }

export function shownValue(change: FeatureUpdateChange, side: 'before' | 'after'): ShownValue {
  const value = change[side]
  const label = side === 'before' ? change.beforeLabel : change.afterLabel
  if (value == null || value === '' || (Array.isArray(value) && value.length === 0)) return { kind: 'empty' }
  if (change.field === 'geometry') return { kind: 'geometry' }
  if (label) return { kind: 'text', text: label }
  if (Array.isArray(value)) return { kind: 'text', text: value.join(', ') }
  if (typeof value === 'string' && DATE.test(value)) {
    const date = new Date(`${value}T12:00:00Z`)
    return { kind: 'text', text: new Intl.DateTimeFormat('fr-BE', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date) }
  }
  if (typeof value === 'object') return { kind: 'text', text: JSON.stringify(value) }
  return { kind: 'text', text: String(value) }
}

/** A field the person can retype before accepting (not a position, not a nested object). */
export function adjustable(change: FeatureUpdateChange): boolean {
  if (change.field === 'geometry') return false
  const after = change.after
  return after == null || ['string', 'number', 'boolean'].includes(typeof after) || Array.isArray(after)
}

/** The text an input starts with for an adjustable field. */
export function inputValue(change: FeatureUpdateChange): string {
  const after = change.after
  if (after == null) return ''
  return Array.isArray(after) ? after.join(', ') : String(after)
}

/**
 * The adjustment sent with « Accepter avec ces valeurs »: only the fields
 * typed in the form, in the shape the server expects (tags as a list,
 * properties merged key by key, an emptied property removed).
 */
export function adjustedChanges(changes: FeatureUpdateChange[], typed: Record<string, string>): ProposedChanges {
  const out: ProposedChanges = {}
  for (const change of changes) {
    if (!(change.field in typed) || !adjustable(change)) continue
    const text = typed[change.field].trim()
    const key = fieldKey(change.field)
    if (change.field === 'tags') out.tags = text.split(',').map((tag) => tag.trim()).filter(Boolean)
    else if (change.field === 'name' || change.field === 'notes') out[change.field] = text || null
    else {
      out.properties ??= {}
      out.properties[key] = text === '' ? null : typeof change.after === 'number' && /^\d+$/.test(text) ? Number(text) : text
    }
  }
  return out
}

/** Updates of one proposal (batch), in the order the server gave them. */
export function updatesOfBatch(updates: FeatureUpdateData[], batch: string): FeatureUpdateData[] {
  return updates.filter((u) => u.batch === batch)
}
