import clsx from 'clsx'
import { Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Select } from '@/components/ui/Field'
import { formatDecimal, strataLabel, vocab } from '@/components/plants/format'
import { api } from '@/lib/api'
import { formatArea, t } from '@/lib/i18n'
import { useEditor } from '@/map/editor/EditorContext'
import { AlertsList } from '@/map/plants/AlertsList'
import { ownProperties } from '@/map/plants/properties'
import { setPlanting, usePlanting } from '@/map/plants/store'
import { StrataDot } from '@/map/plants/strata'
import type { MapFeature } from '@/types'
import type { PatchLine, PlantingState } from '@/types/plants'

const EXPOSURES = ['sun', 'partial-shade', 'shade']

/**
 * Inspector section of a patch: its composition (species at a density or a
 * count), quantities computed from the measured area, exposure and the
 * patch's own coherence alerts.
 */
export default function PatchSection({ feature }: { feature: MapFeature }) {
  const editor = useEditor()
  const mapId = editor.map.id
  const { data, error } = usePlanting(mapId)
  const id = feature.properties.id
  const base = `/maps/${mapId}/features/${id}/patch_items`
  const patch = data?.patches[String(id)]
  const exposure = typeof feature.properties.exposure === 'string' ? feature.properties.exposure : ''

  async function write(path: string, method: string, body?: unknown) {
    try {
      const r = await api<{ planting: PlantingState }>(path, { method, body })
      setPlanting(mapId, r.planting)
    } catch (e) {
      editor.notify(e instanceof Error ? e.message : String(e), 'error')
    }
  }

  async function setExposure(value: string) {
    const properties = { ...ownProperties(feature), exposure: value || undefined }
    if (!value) delete properties.exposure
    try {
      await editor.updateFeature(id, { properties })
    } catch (e) {
      editor.notify(e instanceof Error ? e.message : String(e), 'error')
    }
  }

  if (error) return <p className="border-t border-loam-100 pt-3 text-xs text-clay-500">{t('patches.load_error')}</p>
  if (!data) return null
  const lines = patch?.items ?? []
  const used = new Set(lines.map((l) => `${l.speciesId}-${l.varietyId ?? ''}`))
  const available = data.palette.filter((i) => !used.has(`${i.speciesId}-${i.varietyId ?? ''}`))
  const alerts = data.alerts.alerts.filter((a) => a.featureId === id)

  return (
    <section className="space-y-3 border-t border-loam-100 pt-3 text-sm">
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-loam-500">{t('patches.composition')}</h3>
        <p className="mt-0.5 text-xs text-loam-500">
          <span className="font-semibold text-loam-800">{t('patches.total', { count: patch?.total ?? 0 })}</span>
          {patch?.areaM2 != null && <> · {t('patches.area', { area: formatArea(patch.areaM2) })}</>}
        </p>
      </div>

      <label className="block">
        <span className="mb-1 block text-xs font-medium text-loam-600">{t('patches.exposure')}</span>
        <Select value={exposure} disabled={!editor.canEdit} onChange={(e) => setExposure(e.target.value)}>
          <option value="">{t('patches.exposure_unknown')}</option>
          {EXPOSURES.map((k) => <option key={k} value={k}>{vocab('exposures', k)}</option>)}
        </Select>
      </label>

      {lines.length === 0 ? (
        <p className="rounded-lg border border-dashed border-loam-300 p-2 text-xs text-loam-500">{t('patches.empty')}</p>
      ) : (
        <ul className="space-y-2">
          {lines.map((line) => (
            <PatchLineRow
              key={line.id}
              line={line}
              name={paletteName(data, line)}
              canEdit={editor.canEdit}
              onChange={(body) => write(`${base}/${line.id}`, 'PATCH', { patch_item: body })}
              onRemove={() => write(`${base}/${line.id}`, 'DELETE')}
            />
          ))}
        </ul>
      )}

      {editor.canEdit && (
        data.palette.length === 0 ? (
          <p className="text-xs text-loam-500">{t('patches.palette_empty')}</p>
        ) : available.length === 0 ? (
          <p className="text-xs text-loam-400">{t('patches.all_in')}</p>
        ) : (
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-loam-600">{t('patches.add')}</span>
            <Select
              value=""
              onChange={(e) => {
                const item = available.find((i) => String(i.id) === e.target.value)
                if (item) void write(base, 'POST', { patch_item: { species_id: item.speciesId, variety_id: item.varietyId } })
              }}
            >
              <option value="">{t('patches.add_placeholder')}</option>
              {available.map((i) => <option key={i.id} value={i.id}>{i.name} · {strataLabel(i.effectiveStrata)}</option>)}
            </Select>
          </label>
        )
      )}

      {alerts.length > 0 && <AlertsList alerts={alerts} />}
    </section>
  )
}

function paletteName(data: PlantingState, line: PatchLine): string {
  const item = data.palette.find((i) => i.speciesId === line.speciesId && i.varietyId === line.varietyId)
  if (item) return item.name
  const species = data.species[String(line.speciesId)]
  const variety = line.varietyId != null ? data.varieties[String(line.varietyId)] : null
  const base = species?.commonName ?? species?.latinName ?? '?'
  return variety ? `${base} '${variety.name}'` : base
}

function PatchLineRow({ line, name, canEdit, onChange, onRemove }: {
  line: PatchLine; name: string; canEdit: boolean; onChange: (body: Record<string, unknown>) => void; onRemove: () => void
}) {
  const counted = line.count != null
  const shown = counted ? String(line.count) : line.density != null ? formatDecimal(line.density) : ''
  const [value, setValue] = useState(shown)
  useEffect(() => setValue(shown), [shown])
  const spacing = !counted && line.effectiveDensity ? 1 / Math.sqrt(line.effectiveDensity) : null

  function commit() {
    const n = value.trim() === '' ? null : Number(value.replace(',', '.'))
    if (n != null && !Number.isFinite(n)) return
    if (counted) {
      if (n !== line.count) onChange({ count: n == null ? 0 : Math.round(n) })
    } else if (n !== line.density) {
      onChange({ density: n })
    }
  }

  return (
    <li className="rounded-lg bg-loam-50 p-2">
      <div className="flex items-center gap-2">
        <StrataDot strata={line.effectiveStrata} />
        <p className="min-w-0 flex-1 truncate font-medium text-loam-800">{name}</p>
        <span className="text-xs font-semibold tabular-nums text-loam-800">{t('patches.quantity', { count: line.quantity })}</span>
        {canEdit && (
          <button type="button" onClick={onRemove} className="rounded p-1 text-loam-400 hover:bg-loam-100" aria-label={t('patches.remove')} title={t('patches.remove')}>
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
        <div className="inline-flex rounded-md bg-white p-0.5 ring-1 ring-loam-200" role="group" aria-label={t('patches.mode')}>
          {(['density', 'count'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              disabled={!canEdit}
              aria-pressed={(mode === 'count') === counted}
              onClick={() => {
                if ((mode === 'count') === counted) return
                onChange(mode === 'count' ? { count: line.quantity, density: null } : { count: null })
              }}
              className={clsx('rounded px-2 py-0.5 text-xs', (mode === 'count') === counted ? 'bg-prune-600 text-white' : 'text-loam-600')}
            >
              {t(`patches.modes.${mode}`)}
            </button>
          ))}
        </div>
        <input
          type="text"
          inputMode="decimal"
          value={value}
          disabled={!canEdit}
          aria-label={counted ? t('patches.count') : t('patches.density')}
          placeholder={counted ? '' : formatDecimal(line.defaultDensity)}
          onChange={(e) => setValue(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
          className="w-16 rounded-md border-0 px-2 py-1 text-xs ring-1 ring-inset ring-loam-200 focus:ring-2 focus:ring-prune-500"
        />
        <span className="text-xs text-loam-500">{counted ? t('patches.plants_unit') : t('patches.density_unit')}</span>
      </div>
      {!counted && (
        <p className="mt-1 text-[11px] text-loam-500">
          {line.density == null && t('patches.default_density', { density: formatDecimal(line.defaultDensity), strata: strataLabel(line.effectiveStrata) })}
          {line.density == null && spacing != null && ' · '}
          {spacing != null && t('patches.spacing', { value: formatDecimal(Math.round(spacing * 100) / 100) })}
        </p>
      )}
    </li>
  )
}
