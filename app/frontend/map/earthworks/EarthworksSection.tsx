import { Lightbulb, Shovel } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Field, Input, Select } from '@/components/ui/Field'
import { formatNumber, t } from '@/lib/i18n'
import { elementFor, storedProperties } from '@/map/drawing/catalog'
import { saveFeature } from '@/map/drawing/save'
import { useDrawingState } from '@/map/drawing/store'
import { useEditor } from '@/map/editor/EditorContext'
import {
  DESTINATION_KEY, DESTINATIONS, destinationOf, excavation, isDiggable, isDone, isReceiving, receiverGap, SOIL_PARTS, topsoilCm,
  type Balance, type Receiver, type SoilPart,
} from '@/map/earthworks/earthworks'
import { featureName, loadsText, m3, measureOf, useEarthworks } from '@/map/earthworks/model'
import type { MapFeature } from '@/types'

/** Diggable elements (pond, swale, sunken path…) and those that receive soil (mound, raised bed, zone). */
export function appliesToEarthworks(feature: MapFeature): boolean {
  return isDiggable(feature.properties.kind) || isReceiving(feature.properties.kind)
}

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
  const version = useDrawingState((s) => s.version)
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

  async function choose(part: SoilPart, value: string) {
    if (value !== NEW_MOUND) {
      const target = value === '' ? null : /^\d+$/.test(value) ? Number(value) : value
      await save({ [DESTINATION_KEY[part]]: target })
      return
    }
    // One step further: draw the mound that takes this soil, linked at once.
    editor.notify(t('earthworks.section.drawing_mound'))
    const geometry = await editor.draw('polygon')
    if (!geometry) return
    try {
      const spec = elementFor('mound')!
      const mound = await editor.createFeature({
        layer: spec.layer, kind: 'mound', geometry, properties: { ...spec.defaults }, ...(version ? { tags: [version] } : {}),
      })
      const fresh = editor.features.find((f) => f.properties.id === p.id) ?? feature
      const next = { ...storedProperties(fresh), [DESTINATION_KEY[part]]: mound.properties.id }
      await saveFeature(editor, p.id, { properties: next })
      editor.notify(t('earthworks.section.mound_created'))
    } catch (error) {
      editor.notify((error as Error).message, 'error')
    }
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
              <DestinationField
                key={part}
                label={part === 'topsoil'
                  ? t('earthworks.section.topsoil_line', { cm: formatNumber(cm), volume: m3(amounts[part]) })
                  : t('earthworks.section.subsoil_line', { volume: m3(amounts[part]) })}
                value={destinationOf(p, part)}
                selfId={p.id}
                balance={balance}
                byId={byId}
                disabled={!editor.canEdit}
                onChange={(value) => void choose(part, value)}
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

/** One part's destination: a receiver of the map, a keyword, or a new mound to draw. */
function DestinationField({ label, value, selfId, balance, byId, disabled, onChange }: {
  label: string
  value: number | string | null
  selfId: number
  balance: Balance
  byId: Map<number, MapFeature>
  disabled: boolean
  onChange: (value: string) => void
}) {
  const receivers = balance.receivers.filter((r) => r.id !== selfId)
  // A destination that is no longer a receiver (deleted, other version) reads as undecided.
  const current = value == null ? '' : typeof value === 'number' ? (receivers.some((r) => r.id === value) ? String(value) : '') : value
  if (disabled) {
    const text = current === '' ? t('earthworks.destinations.undecided')
      : /^\d+$/.test(current) ? featureName(byId.get(Number(current))) : t(`earthworks.destinations.${current}`)
    return (
      <div className="text-sm">
        <p className="text-loam-600">{label}</p>
        <p className="font-medium text-loam-900">→ {text}</p>
      </div>
    )
  }
  return (
    <Field label={label}>
      <Select value={current} onChange={(e) => onChange(e.target.value)} aria-label={`${label} — ${t('earthworks.section.goes_to')}`}>
        <option value="">{t('earthworks.destinations.undecided')}</option>
        <optgroup label={t('earthworks.destinations.on_map')}>
          {receivers.map((r) => <option key={r.id} value={r.id}>{receiverOption(r, byId)}</option>)}
          <option value={NEW_MOUND}>{t('earthworks.destinations.new_mound')}</option>
        </optgroup>
        <optgroup label={t('earthworks.destinations.elsewhere')}>
          {DESTINATIONS.map((d) => <option key={d} value={d}>{t(`earthworks.destinations.${d}`)}</option>)}
        </optgroup>
      </Select>
    </Field>
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
    SOIL_PARTS.filter((part) => dig.to[part] === receiver.id).map((part) => ({ dig, part, volume: dig.excavation[part] })),
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
