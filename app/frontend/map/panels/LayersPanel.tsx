import clsx from 'clsx'
import { AlertTriangle, Image as ImageIcon, Map as MapIcon, ZoomIn } from 'lucide-react'
import type { Map as MapLibreMap } from 'maplibre-gl'
import { useEffect, useState } from 'react'
import { t, translations } from '@/lib/i18n'
import { useEditor } from '@/map/editor/EditorContext'
import { layerStore, opacityOf, useLayerState, type LayerState } from '@/map/data/store'
import type { RegionLayerData } from '@/types'

const orderOf = (layer: RegionLayerData) => Number(layer.options.order ?? layer.position ?? 0)
const byOrder = (a: RegionLayerData, b: RegionLayerData) => orderOf(a) - orderOf(b)

function groupLabel(group: string | null) {
  const labels = translations('map_data.groups')
  return (group && typeof labels[group] === 'string' ? labels[group] : labels.other) as string
}

function useZoom(map: MapLibreMap) {
  const [zoom, setZoom] = useState(() => map.getZoom())
  useEffect(() => {
    const update = () => setZoom(map.getZoom())
    map.on('zoomend', update)
    return () => {
      map.off('zoomend', update)
    }
  }, [map])
  return zoom
}

/**
 * "Couches": the base map (plan or aerial photos of several years) and the
 * region's data layers, grouped, each with a toggle, a one-line
 * explanation and an opacity slider. The choice is remembered per map.
 */
export default function LayersPanel() {
  const { regionLayers, instance } = useEditor()
  const state = useLayerState()
  const zoom = useZoom(instance)
  const bases = regionLayers.filter((l) => l.category === 'base').sort(byOrder)
  const overlays = regionLayers.filter((l) => l.category === 'overlay').sort(byOrder)
  const groupOrder = Object.keys(translations('map_data.groups'))
  const rank = (group: string | null) => {
    const index = group ? groupOrder.indexOf(group) : -1
    return index === -1 ? groupOrder.length : index
  }
  const groups = [...new Set(overlays.map((l) => l.group))]
    .sort((a, b) => rank(a) - rank(b))
    .map((group) => ({ group, layers: overlays.filter((l) => l.group === group) }))
  const activeBase = bases.find((l) => l.key === state.base)
  const activeCount = state.overlays.length

  return (
    <div className="space-y-5">
      {bases.length > 0 && (
        <section aria-labelledby="layers-base-title">
          <h3 id="layers-base-title" className="mb-2 text-xs font-semibold uppercase tracking-wide text-loam-500">
            {t('map_data.layers.base_title')}
          </h3>
          <div role="radiogroup" aria-labelledby="layers-base-title" className="grid grid-cols-2 gap-2">
            {bases.map((base) => (
              <BaseButton key={base.key} layer={base} checked={state.base === base.key} />
            ))}
          </div>
          {activeBase && state.errors.includes(activeBase.key) ? (
            <p className="mt-2 flex items-start gap-1.5 text-xs text-humus-700">
              <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {t('map_data.layers.base_unreachable')}
            </p>
          ) : (
            activeBase?.description && <p className="mt-2 text-xs text-loam-500">{activeBase.description}</p>
          )}
        </section>
      )}

      <section aria-labelledby="layers-overlays-title">
        <div className="mb-1 flex items-center justify-between gap-2">
          <h3 id="layers-overlays-title" className="text-xs font-semibold uppercase tracking-wide text-loam-500">
            {t('map_data.layers.overlays_title')}
          </h3>
          {activeCount > 0 && (
            <button type="button" onClick={() => layerStore.hideAll()} className="rounded px-1.5 py-0.5 text-xs text-prune-600 hover:bg-prune-50">
              {t('map_data.layers.hide_all')}
            </button>
          )}
        </div>
        {overlays.length === 0 ? (
          <p className="text-sm text-loam-500">{t('map_data.layers.empty')}</p>
        ) : (
          <>
            <p className="mb-3 text-xs text-loam-500">{t('map_data.layers.intro')}</p>
            <div className="space-y-2">
              {groups.map(({ group, layers }) => (
                <OverlayGroup key={group ?? 'other'} label={groupLabel(group)} layers={layers} state={state} zoom={zoom} />
              ))}
            </div>
            <p className="mt-3 text-xs text-loam-400" aria-live="polite">
              {t('map_data.layers.active_count', { count: activeCount })}
            </p>
          </>
        )}
      </section>
    </div>
  )
}

function BaseButton({ layer, checked }: { layer: RegionLayerData; checked: boolean }) {
  const Icon = layer.kind === 'style' ? MapIcon : ImageIcon
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      onClick={() => layerStore.setBase(layer.key)}
      className={clsx(
        'flex min-h-11 items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm ring-1 ring-inset transition-colors',
        checked ? 'bg-prune-50 font-medium text-prune-800 ring-prune-400' : 'bg-white text-loam-700 ring-loam-200 hover:bg-loam-50',
      )}
    >
      <Icon className={clsx('h-4 w-4 shrink-0', checked ? 'text-prune-600' : 'text-loam-400')} aria-hidden="true" />
      <span className="leading-tight">{layer.name}</span>
    </button>
  )
}

function OverlayGroup({ label, layers, state, zoom }: { label: string; layers: RegionLayerData[]; state: LayerState; zoom: number }) {
  const on = layers.filter((l) => state.overlays.includes(l.key)).length
  return (
    <details open className="group rounded-lg ring-1 ring-loam-200">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm font-medium text-loam-800 hover:bg-loam-50 [&::-webkit-details-marker]:hidden">
        <span>{label}</span>
        <span className={clsx('rounded-full px-1.5 text-xs tabular-nums', on ? 'bg-prune-100 text-prune-700' : 'text-loam-400')}>
          {t('map_data.layers.group_count', { on, total: layers.length })}
        </span>
      </summary>
      <ul className="divide-y divide-loam-100 border-t border-loam-100">
        {layers.map((layer) => (
          <OverlayRow key={layer.key} layer={layer} state={state} zoom={zoom} />
        ))}
      </ul>
    </details>
  )
}

function OverlayRow({ layer, state, zoom }: { layer: RegionLayerData; state: LayerState; zoom: number }) {
  const on = state.overlays.includes(layer.key)
  const id = `overlay-${layer.key}`
  const opacity = Math.round(opacityOf(state, layer) * 100)
  const tooFar = layer.minZoom != null && Math.round(zoom) < layer.minZoom
  const failing = state.errors.includes(layer.key)
  return (
    <li className="px-3 py-2.5">
      <div className="flex items-start gap-2.5">
        <input
          id={id}
          type="checkbox"
          checked={on}
          onChange={(e) => layerStore.setOverlay(layer.key, e.target.checked)}
          aria-describedby={layer.description ? `${id}-description` : undefined}
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-loam-300 text-prune-600 focus:ring-prune-500"
        />
        <div className="min-w-0 flex-1">
          <label htmlFor={id} className="block cursor-pointer text-sm font-medium leading-tight text-loam-800">
            {layer.name}
          </label>
          {layer.description && (
            <p id={`${id}-description`} className="mt-0.5 text-xs leading-snug text-loam-500">{layer.description}</p>
          )}
          {on && (
            <div className="mt-2 space-y-1.5">
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={opacity}
                onChange={(e) => layerStore.setOpacity(layer.key, Number(e.target.value) / 100)}
                aria-label={t('map_data.layers.opacity', { name: layer.name })}
                aria-valuetext={`${opacity} %`}
                className="h-1.5 w-full cursor-pointer accent-prune-600"
              />
              {failing && (
                <p className="flex items-center gap-1.5 text-xs text-humus-700">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  {t('map_data.layers.unreachable')}
                </p>
              )}
              {!failing && tooFar && (
                <p className="flex items-center gap-1.5 text-xs text-loam-500">
                  <ZoomIn className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  {t('map_data.layers.zoom_in')}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </li>
  )
}
