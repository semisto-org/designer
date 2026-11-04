// The card of a building clicked in the 3D view. A building drawn on the
// map gets its roof set here (shape, ridge, gutters, which way a single
// slope falls), seen at once in 3D and saved to its card. A neighbour read
// from OpenStreetMap only has a guessed roof: one click takes it over as a
// building of the map, with its footprint and height, to set its roof too.
// Where the region publishes a 3D model of its buildings, the roof shown is
// the measured one: the card says so, and a roof set by hand for the
// project can go back to it.
import { ArrowLeftRight, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Field'
import { IconButton } from '@/components/ui/IconButton'
import { toast } from '@/components/ui/toast'
import { api, ApiError } from '@/lib/api'
import { t } from '@/lib/i18n'
import type { MapFeature } from '@/types'
import type { BuildingPick } from './controller.ts'
import { formatNumber } from './format.ts'
import { ChoiceGroup } from './ui.tsx'

type Shape = 'pitched' | 'hip' | 'shed' | 'flat'
const SHAPES: Shape[] = ['pitched', 'hip', 'shed', 'flat']
const SAVE_DELAY_MS = 600

/** The roof keys of a building's card, as the 3D view reads them (relief/buildings.ts). */
export type RoofProps = { roof?: string | null; height_m?: number; eaves_m?: number | null; ridge?: string; roof_flip?: boolean }

function metres(value: number): string {
  return formatNumber(value, value % 1 ? 1 : 0)
}

function parsed(text: string): number | null {
  const n = Number(text.replace(',', '.'))
  return text.trim() && Number.isFinite(n) && n > 0 ? n : null
}

export function RoofCard({ mapId, pick, feature, drawnFeature, canEdit, onFeature, onClose }: {
  mapId: number
  pick: BuildingPick
  /** The drawn building, null for an OpenStreetMap one. */
  feature: MapFeature | null
  /** A building of the region's model standing for one drawn on the map without its own roof: that feature. */
  drawnFeature: MapFeature | null
  canEdit: boolean
  /** A feature changed (here, before saving, then as saved) or was created. */
  onFeature: (feature: MapFeature) => void
  onClose: () => void
}) {
  return (
    <div
      className="absolute inset-x-3 top-3 z-30 space-y-3 rounded-2xl border border-loam-200 bg-white/95 p-4 pr-10 text-sm text-loam-600 shadow-lg backdrop-blur sm:inset-x-auto sm:bottom-28 sm:right-3 sm:top-auto sm:w-80"
      aria-live="polite"
    >
      <IconButton label={t('relief.page.roof.close')} size="sm" className="absolute right-1.5 top-1.5" onClick={onClose}>
        <X />
      </IconButton>
      {feature
        ? <DrawnRoof key={feature.properties.id} mapId={mapId} feature={feature} pick={pick} canEdit={canEdit} onFeature={onFeature} />
        : <MappedBuilding mapId={mapId} pick={pick} drawnFeature={drawnFeature} canEdit={canEdit} onFeature={onFeature} />}
    </div>
  )
}

/**
 * A neighbour from OpenStreetMap (its guessed height) or from the region's
 * 3D model (its measured roof), and « Régler son toit » to take it over:
 * added to the map, or, for a building already drawn there, given a roof
 * of its own.
 */
function MappedBuilding({ mapId, pick, drawnFeature, canEdit, onFeature }: {
  mapId: number; pick: BuildingPick; drawnFeature: MapFeature | null; canEdit: boolean; onFeature: (feature: MapFeature) => void
}) {
  const [busy, setBusy] = useState(false)
  const model = pick.source === 'model'
  async function takeOver() {
    setBusy(true)
    try {
      const height = Math.min(80, Math.max(1, Math.round(pick.height * 2) / 2))
      const properties: Record<string, unknown> = { height_m: height, roof: pick.roof }
      if (pick.roof !== 'flat') properties.eaves_m = Math.min(height, Math.max(0.5, Math.round(pick.eaves * 2) / 2))
      const saved = drawnFeature
        ? await api<MapFeature>(`/maps/${mapId}/features/${drawnFeature.properties.id}`, {
          method: 'PATCH',
          body: { feature: { lock_version: drawnFeature.properties.lockVersion, properties_patch: properties } },
        })
        : await api<MapFeature>(`/maps/${mapId}/features`, {
          method: 'POST',
          body: { feature: { layer: 'existing', kind: 'building', geometry: { type: 'Polygon', coordinates: model ? pick.rings.slice(0, 1) : pick.rings }, properties } },
        })
      onFeature(saved)
    } catch {
      toast(t('relief.page.roof.failed'), { tone: 'error' })
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <div>
        <p className="font-semibold text-loam-900">
          {drawnFeature ? drawnFeature.properties.name || t(`editor.kinds.${drawnFeature.properties.kind}`) : t(model ? 'relief.page.roof.title_model' : 'relief.page.roof.title_osm')}
        </p>
        <p>{t(`relief.page.roof.source.${pick.source}`, { height: metres(pick.height), eaves: metres(pick.eaves) })}</p>
      </div>
      {canEdit ? (
        <>
          <p>{t(drawnFeature ? 'relief.page.roof.take_over_drawn' : model ? 'relief.page.roof.take_over_model' : 'relief.page.roof.take_over_intro')}</p>
          <Button size="sm" className="w-full" onClick={takeOver} disabled={busy}>
            {busy ? t('relief.page.roof.taking_over') : t('relief.page.roof.take_over')}
          </Button>
        </>
      ) : (
        <p className="text-loam-500">{t('relief.page.roof.viewer')}</p>
      )}
    </>
  )
}

/** A drawn building: its roof, changed in 3D at once and saved a moment later. */
function DrawnRoof({ mapId, feature, pick, canEdit, onFeature }: {
  mapId: number; feature: MapFeature; pick: BuildingPick; canEdit: boolean; onFeature: (feature: MapFeature) => void
}) {
  const props = feature.properties as MapFeature['properties'] & RoofProps
  const shape: Shape = props.roof === 'green' ? 'flat' : SHAPES.includes(props.roof as Shape) ? (props.roof as Shape) : pick.roof
  const [heightText, setHeightText] = useState(() => metres(Number(props.height_m) || pick.height))
  const [eavesText, setEavesText] = useState(() => (props.eaves_m ? metres(Number(props.eaves_m)) : ''))
  const latest = useRef(feature)
  latest.current = feature
  const pending = useRef<{ patch: Record<string, unknown>; timer: ReturnType<typeof setTimeout> | null }>({ patch: {}, timer: null })

  async function save() {
    const state = pending.current
    if (state.timer) clearTimeout(state.timer)
    state.timer = null
    const patch = state.patch
    state.patch = {}
    if (!Object.keys(patch).length) return
    try {
      const saved = await api<MapFeature>(`/maps/${mapId}/features/${feature.properties.id}`, {
        method: 'PATCH',
        body: { feature: { lock_version: latest.current.properties.lockVersion, properties_patch: patch } },
      })
      onFeature(saved)
    } catch (error) {
      toast(t(error instanceof ApiError && error.status === 409 ? 'relief.page.roof.conflict' : 'relief.page.roof.failed'), { tone: 'error' })
    }
  }

  // Leaving the card saves what is still waiting.
  useEffect(() => () => { if (pending.current.timer) void save() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function change(patch: RoofProps) {
    // Seen at once in 3D; saved once the hand rests.
    onFeature({ ...latest.current, properties: { ...latest.current.properties, ...patch } })
    const state = pending.current
    Object.assign(state.patch, patch)
    if (state.timer) clearTimeout(state.timer)
    state.timer = setTimeout(() => void save(), SAVE_DELAY_MS)
  }

  const name = props.name || t(`editor.kinds.${props.kind}`)
  if (!canEdit) {
    return (
      <div>
        <p className="font-semibold text-loam-900">{name}</p>
        <p>{t(`drawing.options.roof.${props.roof ?? 'flat'}`)} · {metres(pick.height)} m</p>
        <p className="mt-2 text-loam-500">{t('relief.page.roof.viewer')}</p>
      </div>
    )
  }
  return (
    <>
      <p className="font-semibold text-loam-900">{name}</p>
      <ChoiceGroup
        label={t('relief.page.roof.shape')}
        value={shape}
        columns={2}
        choices={SHAPES.map((value) => ({ value, label: t(`relief.page.roof.shapes.${value}`) }))}
        onChange={(roof) => change({ roof, ...(roof !== 'flat' && !props.height_m ? { height_m: Number(pick.height.toFixed(1)) } : {}) })}
      />
      {(shape === 'pitched' || shape === 'shed') && (
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <ChoiceGroup
              label={t('relief.page.roof.ridge')}
              value={props.ridge === 'short' ? 'short' : 'long'}
              choices={(['long', 'short'] as const).map((value) => ({ value, label: t(`relief.page.roof.ridges.${value}`) }))}
              onChange={(ridge) => change({ ridge })}
            />
          </div>
          {shape === 'shed' && (
            <IconButton label={t('relief.page.roof.flip')} size="sm" pressed={props.roof_flip === true} onClick={() => change({ roof_flip: props.roof_flip !== true })}>
              <ArrowLeftRight />
            </IconButton>
          )}
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Field label={t(shape === 'flat' ? 'relief.page.roof.height_flat' : 'relief.page.roof.height')}>
          <Input
            inputMode="decimal"
            value={heightText}
            onChange={(event) => {
              setHeightText(event.target.value)
              const value = parsed(event.target.value)
              if (value != null && value <= 80) change({ height_m: value })
            }}
          />
        </Field>
        {shape !== 'flat' && (
          <Field label={t('relief.page.roof.eaves')}>
            <Input
              inputMode="decimal"
              value={eavesText}
              placeholder={`${metres(pick.eaves)} · ${t('relief.page.roof.eaves_auto')}`}
              onChange={(event) => {
                setEavesText(event.target.value)
                const value = parsed(event.target.value)
                if (!event.target.value.trim()) change({ eaves_m: null })
                else if (value != null && value <= 80) change({ eaves_m: value })
              }}
            />
          </Field>
        )}
      </div>
      {pick.overridesModel && !props.planned ? (
        <div className="space-y-2 border-t border-loam-100 pt-3">
          <p className="text-loam-500">{t('relief.page.roof.back_to_model_hint')}</p>
          <Button size="sm" variant="secondary" className="w-full" onClick={() => change({ roof: null })}>
            {t('relief.page.roof.back_to_model')}
          </Button>
        </div>
      ) : (
        <>
          <p className="text-loam-500">{t('relief.page.roof.measure_hint')}</p>
          <p className="hidden text-loam-500 sm:block">{t('relief.page.roof.complex_hint')}</p>
        </>
      )}
    </>
  )
}
