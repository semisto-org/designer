import { Lightbulb, Plus, Shovel, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select } from '@/components/ui/Field'
import { IconButton } from '@/components/ui/IconButton'
import { formatNumber, t } from '@/lib/i18n'
import { elementFor, storedProperties } from '@/map/drawing/catalog'
import { saveFeature } from '@/map/drawing/save'
import { useEditor } from '@/map/editor/EditorContext'
import {
  DESTINATION_KEY, DESTINATIONS, destinationsOf, excavation, isDiggable, isDone, receiverGap, SOIL_PARTS, storedDestinations, topsoilCm,
  type Balance, type Destination, type DestinationEntry, type Dig, type Receiver, type SoilPart,
} from '@/map/earthworks/earthworks'
import { featureName, loadsText, m3, measureOf, useEarthworks } from '@/map/earthworks/model'
import type { MapFeature } from '@/types'

/** Diggable elements (pond, swale, sunken path…) and those that receive soil (mound, raised bed, zone). */
const NEW_MOUND = '__new_mound'
const TIPS: Record<string, string> = { pond: 'tip_pond', swale: 'tip_swale', path: 'tip_path', track: 'tip_path' }

/**
 * Inspector section « Terre excavée » of a dug element (how much soil, how
 * much of it topsoil, where each part goes), or « Terre reçue » of a mound,
 * a raised bed or a zone (which holes feed it, room left).
 */
export default function EarthworksSection({ feature }: { feature: MapFeature }) {
  const { balance, byId } = useEarthworks()
  if (isDiggable(feature.properties.kind)) return <DigSection feature={feature} balance={balance} byId={byId} />
  const receiver = balance.receivers.find((r) => r.id === feature.properties.id)
  return receiver ? <ReceiverSection feature={feature} receiver={receiver} balance={balance} byId={byId} /> : null
}

function DigSection({ feature, balance, byId }: { feature: MapFeature; balance: Balance; byId: Map<number, MapFeature> }) {
  const editor = useEditor()
  const p = feature.properties
  const dug = excavation(p.kind, p, measureOf(feature))
  const done = isDone(p)
  const cm = topsoilCm(p)
  const [cmDraft, setCmDraft] = useState(String(cm))
  useEffect(() => setCmDraft(String(cm)), [cm])
  if (!dug) return null

  function save(patch: Record<string, unknown>) {
    const next = { ...storedProperties(feature) }
    for (const [key, value] of Object.entries(patch)) {
      if (value == null) delete next[key]
      else next[key] = value
    }
    return saveFeature(editor, p.id, { properties: next })
  }

  /** The destinations of a part that still mean something on this map (a deleted mound drops out). */
  function entriesOf(source: MapFeature, part: SoilPart): DestinationEntry[] {
    return destinationsOf(source.properties, part).filter((e) => typeof e.to !== 'number' || (e.to !== p.id && balance.receivers.some((r) => r.id === e.to)))
  }

  async function saveEntries(part: SoilPart, entries: DestinationEntry[]) {
    await save({ [DESTINATION_KEY[part]]: storedDestinations(entries) })
  }

  /** Sets the destination of row `index` (a new row when index = the number of rows); '' removes it. */
  async function choose(part: SoilPart, index: number, value: string) {
    const entries = entriesOf(feature, part)
    if (value !== NEW_MOUND) {
      const target: Destination | null = value === '' ? null : /^\d+$/.test(value) ? Number(value) : (value as Destination)
      const next = entries.slice()
      if (target == null) next.splice(index, 1)
      else next[index] = { to: target, m3: index < entries.length ? entries[index].m3 : null }
      await saveEntries(part, next)
      return
    }
    // One step further: draw the mound that takes this soil, linked at once.
    editor.notify(t('earthworks.section.drawing_mound'))
    const geometry = await editor.draw('polygon')
    if (!geometry) return
    try {
      const spec = elementFor('mound')!
      const mound = await editor.createFeature({
        layer: spec.layer, kind: 'mound', geometry, properties: { ...spec.defaults },
      })
      const fresh = editor.features.find((f) => f.properties.id === p.id) ?? feature
      const next = destinationsOf(fresh.properties, part)
      next[Math.min(index, next.length)] = { to: mound.properties.id, m3: index < next.length ? next[index].m3 : null }
      await saveFeature(editor, p.id, { properties: { ...storedProperties(fresh), [DESTINATION_KEY[part]]: storedDestinations(next) } })
      editor.notify(t('earthworks.section.mound_created'))
    } catch (error) {
      editor.notify((error as Error).message, 'error')
    }
  }

  async function setVolume(part: SoilPart, index: number, m3Value: number | null) {
    const entries = entriesOf(feature, part)
    if (!entries[index]) return
    entries[index] = { ...entries[index], m3: m3Value }
    await saveEntries(part, entries)
  }

  function commitCm() {
    const parsed = Math.round(Number(cmDraft.replace(',', '.')))
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) return setCmDraft(String(cm))
    if (parsed !== cm) void save({ topsoil_cm: parsed === 25 ? null : parsed })
  }

  const amounts: Record<SoilPart, number> = { topsoil: dug.topsoil, subsoil: dug.subsoil }
  const tip = TIPS[p.kind]

  return (
    <section className="space-y-3 border-t border-loam-100 pt-3">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold text-loam-800">
        <Shovel className="h-4 w-4 text-clay-700" />
        {t('earthworks.section.title')}
      </h3>
      <div className="rounded-lg bg-loam-50 p-3 text-sm text-loam-800">
        <p className="font-semibold tabular-nums">{t('earthworks.section.volume', { volume: m3(dug.volume) })}</p>
        <p className="text-loam-600">{t('earthworks.section.loose', { volume: m3(dug.loose), loads: loadsText(dug.wheelbarrows, dug.trucks) })}</p>
      </div>

      <label className="flex items-start gap-2.5 text-sm text-loam-700">
        <input
          type="checkbox"
          checked={done}
          disabled={!editor.canEdit}
          onChange={(e) => void save({ dug: e.target.checked ? true : null })}
          className="mt-0.5 h-4 w-4 rounded border-loam-300 text-prune-600 focus:ring-prune-500"
        />
        <span>
          {t('earthworks.section.dug')}
          {done && <span className="block text-loam-500">{t('earthworks.section.dug_hint')}</span>}
        </span>
      </label>

      {!done && (
        <>
          {SOIL_PARTS.map((part) => (
            amounts[part] > 0.005 && (
              <PartDestinations
                key={part}
                part={part}
                label={part === 'topsoil'
                  ? t('earthworks.section.topsoil_line', { cm: formatNumber(cm), volume: m3(amounts[part]) })
                  : t('earthworks.section.subsoil_line', { volume: m3(amounts[part]) })}
                entries={entriesOf(feature, part)}
                dig={balance.digs.find((d) => d.id === p.id)}
                selfId={p.id}
                balance={balance}
                byId={byId}
                disabled={!editor.canEdit}
                onChoose={(index, value) => void choose(part, index, value)}
                onVolume={(index, value) => void setVolume(part, index, value)}
              />
            )
          ))}

          {editor.canEdit && (
            <Field label={t('earthworks.section.topsoil_cm')}>
              <div className="relative">
                <Input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={100}
                  step={1}
                  value={cmDraft}
                  onChange={(e) => setCmDraft(e.target.value)}
                  onBlur={commitCm}
                  onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                  className="pr-12"
                />
                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-loam-400">cm</span>
              </div>
            </Field>
          )}

          {tip && (
            <p className="flex items-start gap-1.5 text-sm text-loam-700">
              <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-humus-600" />
              {t(`earthworks.section.${tip}`)}
            </p>
          )}
        </>
      )}
      <p className="text-sm text-loam-500">{t('earthworks.section.hint')}</p>
    </section>
  )
}

const destinationText = (to: Destination, byId: Map<number, MapFeature>) =>
  typeof to === 'number' ? featureName(byId.get(to)) : t(`earthworks.destinations.${to}`)

/**
 * Where one part of the soil goes: one destination or several. Without a
 * volume typed in, a destination takes its share by the room left in it
 * (the placeholder shows that share); a typed volume is kept as is.
 */
function PartDestinations({ part, label, entries, dig, selfId, balance, byId, disabled, onChoose, onVolume }: {
  part: SoilPart
  label: string
  entries: DestinationEntry[]
  dig: Dig | undefined
  selfId: number
  balance: Balance
  byId: Map<number, MapFeature>
  disabled: boolean
  onChoose: (index: number, value: string) => void
  onVolume: (index: number, value: number | null) => void
}) {
  const [adding, setAdding] = useState(false)
  const shares = dig?.to[part] ?? []
  const volumeOf = (to: Destination) => shares.find((s) => s.to === to)?.volume ?? 0
  const undecided = dig?.undecided[part] ?? 0

  if (disabled) {
    return (
      <div className="text-sm">
        <p className="text-loam-600">{label}</p>
        {entries.length === 0 && <p className="font-medium text-loam-900">→ {t('earthworks.destinations.undecided')}</p>}
        {entries.map((e) => (
          <p key={String(e.to)} className="font-medium text-loam-900">
            → {entries.length > 1 ? t('earthworks.section.share', { name: destinationText(e.to, byId), volume: m3(volumeOf(e.to)) }) : destinationText(e.to, byId)}
          </p>
        ))}
        {entries.length > 0 && undecided > 0.05 && <p className="text-humus-800">{t('earthworks.section.share_left', { volume: m3(undecided) })}</p>}
      </div>
    )
  }

  const several = entries.length > 1 || entries.some((e) => e.m3 != null)
  const rows = entries.length === 0 || adding ? entries.length + 1 : entries.length
  return (
    <Field label={label}>
      <div className="space-y-2">
        {Array.from({ length: rows }, (_, index) => {
          const entry = entries[index]
          const taken = entries.filter((_, i) => i !== index).map((e) => e.to)
          return (
            <div key={entry ? String(entry.to) : 'new'} className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <DestinationSelect
                  value={entry?.to ?? null}
                  taken={taken}
                  selfId={selfId}
                  balance={balance}
                  byId={byId}
                  label={`${label} — ${t('earthworks.section.goes_to')}`}
                  onChange={(value) => {
                    setAdding(false)
                    onChoose(index, value)
                  }}
                />
                {entry && entries.length > 1 && (
                  <IconButton size="sm" tone="danger" label={t('earthworks.section.remove_destination')} onClick={() => onChoose(index, '')}>
                    <X />
                  </IconButton>
                )}
                {!entry && adding && (
                  <IconButton size="sm" label={t('earthworks.section.cancel_destination')} onClick={() => setAdding(false)}>
                    <X />
                  </IconButton>
                )}
              </div>
              {entry && several && (
                <div className="flex items-center gap-2 pl-3 text-sm text-loam-600">
                  <VolumeInput
                    fixed={entry.m3}
                    computed={volumeOf(entry.to)}
                    label={t('earthworks.section.share_volume', { name: destinationText(entry.to, byId) })}
                    onCommit={(value) => onVolume(index, value)}
                  />
                  <span>{entry.m3 == null ? t('earthworks.section.share_auto') : t('earthworks.section.share_fixed')}</span>
                </div>
              )}
            </div>
          )
        })}
        {entries.length > 0 && !adding && (
          <Button variant="ghost" size="sm" onClick={() => setAdding(true)} className="-ml-2">
            <Plus className="h-4 w-4" />
            {t('earthworks.section.add_destination')}
          </Button>
        )}
        {several && <p className="text-sm text-loam-500">{t('earthworks.section.share_hint')}</p>}
        {entries.length > 0 && undecided > 0.05 && <p className="text-sm font-medium text-humus-800">{t('earthworks.section.share_left', { volume: m3(undecided) })}</p>}
      </div>
    </Field>
  )
}

/** A destination: a receiver of the map, a keyword, or a new mound to draw. */
function DestinationSelect({ value, taken, selfId, balance, byId, label, onChange }: {
  value: Destination | null
  taken: Destination[]
  selfId: number
  balance: Balance
  byId: Map<number, MapFeature>
  label: string
  onChange: (value: string) => void
}) {
  const receivers = balance.receivers.filter((r) => r.id !== selfId && !taken.includes(r.id))
  const current = value == null ? '' : String(value)
  return (
    <Select value={current} onChange={(e) => onChange(e.target.value)} aria-label={label} className="min-w-0 flex-1">
      <option value="">{t('earthworks.destinations.undecided')}</option>
      <optgroup label={t('earthworks.destinations.on_map')}>
        {receivers.map((r) => <option key={r.id} value={r.id}>{receiverOption(r, byId)}</option>)}
        <option value={NEW_MOUND}>{t('earthworks.destinations.new_mound')}</option>
      </optgroup>
      <optgroup label={t('earthworks.destinations.elsewhere')}>
        {DESTINATIONS.filter((d) => !taken.includes(d)).map((d) => <option key={d} value={d}>{t(`earthworks.destinations.${d}`)}</option>)}
      </optgroup>
    </Select>
  )
}

/** m³ sent to one destination: empty = its share by room (shown as placeholder), a number = kept as typed. */
function VolumeInput({ fixed, computed, label, onCommit }: {
  fixed: number | null; computed: number; label: string; onCommit: (value: number | null) => void
}) {
  const shown = fixed == null ? '' : formatNumber(fixed)
  const [draft, setDraft] = useState(shown)
  useEffect(() => setDraft(shown), [shown])
  function commit() {
    const text = draft.trim()
    if (text === '') return fixed != null && onCommit(null)
    const parsed = Number(text.replace(/\s/g, '').replace(',', '.'))
    if (!Number.isFinite(parsed) || parsed < 0) return setDraft(shown)
    if (parsed !== fixed) onCommit(parsed)
  }
  return (
    <div className="relative w-28 shrink-0">
      <Input
        type="text"
        inputMode="decimal"
        value={draft}
        placeholder={formatNumber(Math.round(computed * 10) / 10)}
        aria-label={label}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        className="pr-9 tabular-nums"
      />
      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-loam-400">m³</span>
    </div>
  )
}

function receiverOption(receiver: Receiver, byId: Map<number, MapFeature>): string {
  const name = featureName(byId.get(receiver.id))
  const gap = receiverGap(receiver)
  if (gap == null) return name
  return gap > 0.05 ? t('earthworks.destinations.feature_left', { name, volume: m3(gap) }) : t('earthworks.destinations.feature_full', { name })
}

function ReceiverSection({ feature, receiver, balance, byId }: {
  feature: MapFeature; receiver: Receiver; balance: Balance; byId: Map<number, MapFeature>
}) {
  const sources = balance.digs.flatMap((dig) =>
    SOIL_PARTS.flatMap((part) => dig.to[part].filter((share) => share.to === receiver.id).map((share) => ({ dig, part, volume: share.volume }))),
  )
  const received = receiver.received.topsoil + receiver.received.subsoil
  // A zone without soil sent to it is just a zone: no section.
  if (receiver.capacity == null && received === 0) return null
  const gap = receiverGap(receiver)

  return (
    <section className="space-y-2 border-t border-loam-100 pt-3 text-sm">
      <h3 className="flex items-center gap-1.5 font-semibold text-loam-800">
        <Shovel className="h-4 w-4 text-clay-700" />
        {t('earthworks.receiver.title')}
      </h3>
      {receiver.capacity != null && <p className="text-loam-700">{t('earthworks.receiver.needs', { volume: m3(receiver.capacity) })}</p>}
      {sources.length === 0 ? (
        <p className="text-loam-500">{t('earthworks.receiver.empty')}</p>
      ) : (
        <ul className="space-y-0.5 text-loam-700">
          {sources.map(({ dig, part, volume }) => (
            <li key={`${dig.id}-${part}`}>
              {t('earthworks.receiver.from', { name: `${featureName(byId.get(dig.id))}, ${t(`earthworks.parts.${part}`).toLowerCase()}`, volume: m3(volume) })}
            </li>
          ))}
        </ul>
      )}
      {gap != null && sources.length > 0 && (
        <p className={gap < -0.05 ? 'font-medium text-humus-700' : 'font-medium text-leaf-700'}>
          {gap > 0.05 ? t('earthworks.receiver.room_left', { volume: m3(gap) })
            : gap < -0.05 ? t('earthworks.receiver.too_much', { volume: m3(-gap) })
              : t('earthworks.receiver.exact')}
        </p>
      )}
      {receiver.capacity == null && receiver.thickness != null && (
        <p className="text-loam-700">{t('earthworks.receiver.thickness', { cm: formatNumber(Math.max(1, Math.round(receiver.thickness * 100))) })}</p>
      )}
      {feature.properties.kind !== 'zone' && <p className="text-loam-500">{t(`earthworks.receiver.hint_${feature.properties.kind}`)}</p>}
    </section>
  )
}
