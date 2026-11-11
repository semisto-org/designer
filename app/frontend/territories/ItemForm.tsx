import { router } from '@inertiajs/react'
import { MapPin, X } from 'lucide-react'
import { useState, type FormEvent, type ReactNode } from 'react'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select, Textarea } from '@/components/ui/Field'
import { t } from '@/lib/i18n'
import type { Geometry } from 'geojson'
import type { TerritoryItem, TerritoryItemKind, TerritoryItemProperties } from '@/types/territories'

const f = (key: string) => t(`territories.show.fields.${key}`)
const v = (group: string, key: string) => t(`territories.show.values.${group}.${key}`)

const SOURCE_KINDS = ['plan', 'council', 'press', 'map', 'study', 'call', 'other']
const RIGHTS = ['open', 'restricted', 'unknown']
const PROOFS = ['computed', 'seen', 'confirmed']
const MARKER_KINDS = ['flood', 'mudflow', 'erosion', 'lost_pond', 'lost_hedge', 'spring', 'other']
const RANKS = ['soil', 'slow', 'structure']
const THEMES = ['water', 'tree']
const LANDS = ['public', 'agricultural', 'private', 'unknown']
const ANSWERS = ['yes', 'no', 'thinking']
const DECISIONS = ['retained', 'postponed', 'dismissed']

type Props = {
  territoryId: number
  kind: TerritoryItemKind
  item?: TerritoryItem
  /** Sources and expectations a marker, an expectation or a lead can point to. */
  sources: TerritoryItem[]
  expectations: TerritoryItem[]
  /** The territory's sub-basins, upstream first, that a marker or a lead belongs to. */
  basins: TerritoryItem[]
  /** Asks the map for one click; resolves the point, or null when cancelled. */
  place: (done: (geometry: Geometry | null) => void) => void
  onDone: () => void
}

/** Adds or changes one entry of the dossier, with the fields its kind keeps. */
export function ItemForm({ territoryId, kind, item, sources, expectations, basins, place, onDone }: Props) {
  const [title, setTitle] = useState(item?.title ?? '')
  const [body, setBody] = useState(item?.body ?? '')
  const [props, setProps] = useState<TerritoryItemProperties>(item?.properties ?? (kind === 'marker' ? { proof: 'computed' } : kind === 'lead' ? { rank: 'soil', theme: 'water', land: 'unknown' } : {}))
  const [geometry, setGeometry] = useState<Geometry | null>(item?.geometry ?? null)
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)

  const set = <K extends keyof TerritoryItemProperties>(key: K, value: TerritoryItemProperties[K]) => setProps((p) => ({ ...p, [key]: value }))
  const setIn = <K extends 'farmer' | 'keeper' | 'decision'>(group: K, key: string, value: unknown) =>
    setProps((p) => ({ ...p, [group]: { ...(p[group] ?? {}), [key]: value } }))

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!title.trim()) return
    setBusy(true)
    const data: Record<string, string | number | File> = {
      kind, title: title.trim(), body,
      properties: JSON.stringify(props),
      geometry: geometry ? JSON.stringify(geometry) : '',
      tab: kind,
    }
    if (file) data.file = file
    const options = { preserveScroll: true, forceFormData: !!file, onSuccess: onDone, onFinish: () => setBusy(false) }
    if (item) router.post(`/territories/${territoryId}/items/${item.id}`, { ...data, _method: 'patch', lock_version: item.lockVersion }, options)
    else router.post(`/territories/${territoryId}/items`, data, options)
  }

  const pickIds = (key: 'source_ids' | 'expectation_ids', list: TerritoryItem[], label: string) => list.length > 0 && (
    <fieldset>
      <legend className="text-sm font-medium text-loam-700">{label}</legend>
      <div className="mt-1 grid gap-1">
        {list.map((other) => {
          const ids = props[key] ?? []
          return (
            <label key={other.id} className="flex items-start gap-2 text-sm text-loam-700">
              <input type="checkbox" className="mt-0.5" checked={ids.includes(other.id)}
                onChange={(e) => set(key, e.target.checked ? [...ids, other.id] : ids.filter((id) => id !== other.id))} />
              {other.title}
            </label>
          )
        })}
      </div>
    </fieldset>
  )

  const choice = (label: string, value: string | undefined, values: string[], group: string, onChange: (value: string) => void, blank = false) => (
    <Field label={label}>
      <Select value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
        {blank && <option value="">{t('territories.show.values.none')}</option>}
        {values.map((key) => <option key={key} value={key}>{v(group, key)}</option>)}
      </Select>
    </Field>
  )

  const basinPick = basins.length > 0 && (
    <Field label={f('basin_id')}>
      <Select value={props.basin_id ?? ''} onChange={(e) => set('basin_id', e.target.value ? Number(e.target.value) : undefined)}>
        <option value="">{t('territories.show.values.none')}</option>
        {basins.map((basin) => <option key={basin.id} value={basin.id}>{basin.properties.order ? `${basin.properties.order}. ` : ''}{basin.title}</option>)}
      </Select>
    </Field>
  )

  const placeButton = (kind === 'marker' || kind === 'lead') && (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" variant="secondary" onClick={() => place((g) => { if (g) setGeometry(g) })}>
        <MapPin className="h-4 w-4" aria-hidden />
        {geometry ? t('territories.show.placed') : t('territories.show.place_on_map')}
      </Button>
      {geometry && (
        <Button size="sm" variant="ghost" onClick={() => setGeometry(null)}>
          <X className="h-4 w-4" aria-hidden />
          {t('territories.show.remove_place')}
        </Button>
      )}
    </div>
  )

  let fields: ReactNode = null
  if (kind === 'actor') {
    fields = (
      <>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={f('organization')}><Input value={props.organization ?? ''} onChange={(e) => set('organization', e.target.value)} /></Field>
          <Field label={f('function')}><Input value={props.function ?? ''} onChange={(e) => set('function', e.target.value)} /></Field>
          <Field label={f('met_on')}><Input type="date" value={props.met_on ?? ''} onChange={(e) => set('met_on', e.target.value)} /></Field>
          <Field label={f('contact')}><Input value={props.contact ?? ''} onChange={(e) => set('contact', e.target.value)} /></Field>
        </div>
      </>
    )
  } else if (kind === 'source') {
    fields = (
      <>
        <Field label={f('url')}><Input type="url" value={props.url ?? ''} onChange={(e) => set('url', e.target.value)} placeholder="https://" /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={f('author')}><Input value={props.author ?? ''} onChange={(e) => set('author', e.target.value)} /></Field>
          <Field label={f('published_on')}><Input value={props.published_on ?? ''} onChange={(e) => set('published_on', e.target.value)} placeholder="2021-07" /></Field>
          {choice(f('source_kind'), props.source_kind, SOURCE_KINDS, 'source_kind', (x) => set('source_kind', x), true)}
          {choice(f('rights'), props.rights ?? 'unknown', RIGHTS, 'rights', (x) => set('rights', x as TerritoryItemProperties['rights']))}
        </div>
        <Field label={f('excerpts')}><Textarea rows={3} value={props.excerpts ?? ''} onChange={(e) => set('excerpts', e.target.value)} /></Field>
        {props.rights === 'open' && (
          <Field label={f('file')} hint={item?.file?.name}>
            <Input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </Field>
        )}
      </>
    )
  } else if (kind === 'expectation') {
    fields = (
      <>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={f('year')}><Input type="number" min={1900} max={2100} value={props.year ?? ''} onChange={(e) => set('year', e.target.value ? Number(e.target.value) : undefined)} /></Field>
          <label className="flex items-center gap-2 self-end pb-2 text-sm text-loam-700">
            <input type="checkbox" checked={props.validated === true} onChange={(e) => set('validated', e.target.checked)} />
            {f('validated')}
          </label>
        </div>
        {pickIds('source_ids', sources, f('source_ids'))}
      </>
    )
  } else if (kind === 'basin') {
    fields = (
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={f('basin_order')} hint={f('basin_order_hint')}>
          <Input type="number" min={1} max={99} value={props.order ?? ''} onChange={(e) => set('order', e.target.value ? Number(e.target.value) : undefined)} />
        </Field>
        <Field label={f('outlet')}><Input value={props.outlet ?? ''} onChange={(e) => set('outlet', e.target.value)} placeholder="le Bocq" /></Field>
      </div>
    )
  } else if (kind === 'marker') {
    fields = (
      <>
        {basinPick}
        <div className="grid gap-3 sm:grid-cols-3">
          {choice(f('marker_kind'), props.marker_kind, MARKER_KINDS, 'marker_kind', (x) => set('marker_kind', x), true)}
          <Field label={f('occurred_on')}><Input value={props.occurred_on ?? ''} onChange={(e) => set('occurred_on', e.target.value)} placeholder="2021-07-14" /></Field>
          {choice(f('proof'), props.proof ?? 'computed', PROOFS, 'proof', (x) => set('proof', x as TerritoryItemProperties['proof']))}
        </div>
        {pickIds('source_ids', sources, f('source_ids'))}
        {placeButton}
      </>
    )
  } else if (kind === 'lead') {
    const needsFarmer = props.land === 'agricultural' || props.land === 'private'
    fields = (
      <>
        {basinPick}
        <div className="grid gap-3 sm:grid-cols-3">
          {choice(f('rank'), props.rank, RANKS, 'rank', (x) => set('rank', x as TerritoryItemProperties['rank']))}
          {choice(f('theme'), props.theme, THEMES, 'theme', (x) => set('theme', x as TerritoryItemProperties['theme']))}
          {choice(f('land'), props.land ?? 'unknown', LANDS, 'land', (x) => set('land', x as TerritoryItemProperties['land']))}
        </div>
        <Field label={f('magnitude')} hint={f('magnitude_hint')}><Input value={props.magnitude ?? ''} onChange={(e) => set('magnitude', e.target.value)} /></Field>
        {pickIds('expectation_ids', expectations, f('expectation_ids'))}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex items-center gap-2 self-end pb-2 text-sm text-loam-700">
            <input type="checkbox" checked={props.seen_on_site === true} onChange={(e) => set('seen_on_site', e.target.checked)} />
            {f('seen_on_site')}
          </label>
          {props.seen_on_site && <Field label={f('seen_on')}><Input type="date" value={props.seen_on ?? ''} onChange={(e) => set('seen_on', e.target.value)} /></Field>}
        </div>
        {placeButton}
        {needsFarmer && (
          <Group title={f('farmer')}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={f('farmer_contacted_on')}><Input type="date" value={props.farmer?.contacted_on ?? ''} onChange={(e) => setIn('farmer', 'contacted_on', e.target.value)} /></Field>
              {choice(f('farmer_answer'), props.farmer?.answer, ANSWERS, 'farmer_answer', (x) => setIn('farmer', 'answer', x), true)}
            </div>
            <Field label={f('farmer_note')}><Input value={props.farmer?.note ?? ''} onChange={(e) => setIn('farmer', 'note', e.target.value)} /></Field>
          </Group>
        )}
        <Group title={f('keeper')}>
          <Field label={f('keeper_role')}><Input value={props.keeper?.role ?? ''} onChange={(e) => setIn('keeper', 'role', e.target.value)} /></Field>
          <Field label={f('keeper_gestures')}><Input value={props.keeper?.gestures ?? ''} onChange={(e) => setIn('keeper', 'gestures', e.target.value)} /></Field>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label={f('keeper_hours')}><Input type="number" min={0} value={props.keeper?.hours_per_year ?? ''} onChange={(e) => setIn('keeper', 'hours_per_year', e.target.value ? Number(e.target.value) : undefined)} /></Field>
            <Field label={f('keeper_lifespan')}><Input type="number" min={0} value={props.keeper?.lifespan_years ?? ''} onChange={(e) => setIn('keeper', 'lifespan_years', e.target.value ? Number(e.target.value) : undefined)} /></Field>
            <Field label={f('keeper_agreement')}><Input value={props.keeper?.agreement ?? ''} onChange={(e) => setIn('keeper', 'agreement', e.target.value)} /></Field>
          </div>
        </Group>
        <Group title={f('decision')}>
          <div className="grid gap-3 sm:grid-cols-3">
            {choice(f('decision_status'), props.decision?.status, DECISIONS, 'decision', (x) => setIn('decision', 'status', x), true)}
            <Field label={f('decision_on')}><Input type="date" value={props.decision?.decided_on ?? ''} onChange={(e) => setIn('decision', 'decided_on', e.target.value)} /></Field>
            <Field label={f('first_step')}>
              <Select value={props.first_step ?? ''} onChange={(e) => set('first_step', e.target.value ? Number(e.target.value) : undefined)}>
                <option value="">{t('territories.show.values.none')}</option>
                {[1, 2, 3].map((n) => <option key={n} value={n}>{v('first_step', String(n))}</option>)}
              </Select>
            </Field>
          </div>
          <Field label={f('decision_reason')}><Input value={props.decision?.reason ?? ''} onChange={(e) => setIn('decision', 'reason', e.target.value)} /></Field>
          <label className="flex items-center gap-2 text-sm text-loam-700">
            <input type="checkbox" checked={props.this_winter === true} onChange={(e) => set('this_winter', e.target.checked)} />
            {f('this_winter')}
          </label>
        </Group>
      </>
    )
  }

  return (
    <form onSubmit={submit} className="grid gap-3 rounded-2xl bg-loam-50 p-4 ring-1 ring-loam-200">
      <Field label={f('title')}><Input value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={200} autoFocus /></Field>
      {fields}
      <Field label={f('body')}><Textarea rows={3} value={body} onChange={(e) => setBody(e.target.value)} /></Field>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onDone}>{t('territories.show.cancel')}</Button>
        <Button type="submit" disabled={busy || !title.trim()}>{t('territories.show.save')}</Button>
      </div>
    </form>
  )
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="grid gap-3 rounded-xl bg-white p-3 ring-1 ring-loam-200">
      <legend className="px-1 text-sm font-semibold text-prune-800">{title}</legend>
      {children}
    </fieldset>
  )
}
