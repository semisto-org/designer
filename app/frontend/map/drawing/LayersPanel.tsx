import clsx from 'clsx'
import { Camera, ChevronDown, Eye, EyeOff, ShieldAlert } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { strataLabel } from '@/components/plants/format'
import { t } from '@/lib/i18n'
import { useEditor } from '@/map/editor/EditorContext'
import { DESIGN_LAYERS, featureColor, layerColor } from '@/map/drawing/catalog'
import { isPlantLike, strataKey, UNKNOWN_STRATA } from '@/map/drawing/hidden'
import { setHiddenKinds, setHiddenLayers, setHiddenSoil, setHiddenStrata, showEverything, toggled, useDrawingState } from '@/map/drawing/store'
import { LAYER_COLORS } from '@/map/layers/features'
import { photoActions, usePhotos } from '@/map/photos/store'
import { usePlanting } from '@/map/plants/store'
import { plantStrata, STRATA_COLORS } from '@/map/plants/strata'
import { soilActions, useSoil } from '@/map/soil/store'
import { SOIL_MARKERS, type SoilMarker } from '@/map/soil/visibility'
import { STRATA } from '@/types/plants'
import type { MapFeature } from '@/types'

/** The colours of the soil markers on the map (see map/soil/layers). */
const SOIL_COLORS: Record<SoilMarker, string> = { bioindicators: '#d9a527', samples: '#3d7d42' }

/** One line under a layer: a kind of element, or (plants) a strata. */
type Part = { key: string; label: string; color: string; count: number; hidden: boolean; toggle: () => void }

/**
 * "Calques": show or hide each design layer, and inside it each kind of
 * element (plants: each strata; what exists: also the bio-indicator plants
 * and soil sampling points), and the photos, for this viewer only.
 */
export default function LayersPanel() {
  const editor = useEditor()
  const hidden = useDrawingState((s) => s.hiddenLayers)
  const hiddenKinds = useDrawingState((s) => s.hiddenKinds)
  const hiddenStrata = useDrawingState((s) => s.hiddenStrata)
  const hiddenSoil = useDrawingState((s) => s.hiddenSoil)
  const soil = useSoil()
  const { data: planting } = usePlanting(editor.map.id)
  const photos = usePhotos()
  const placedPhotos = photos.photos.filter((p) => p.lng != null && p.lat != null).length
  // Layers with something hidden inside open first: it must be easy to find again.
  const [opened, setOpened] = useState<string[]>(() => [...new Set([
    ...(hiddenStrata.length ? ['plants'] : []),
    ...(hiddenSoil.length ? ['existing'] : []),
    ...editor.features.filter((f) => f.properties.kind && hiddenKinds.includes(f.properties.kind)).map((f) => f.properties.layer as string),
  ])])

  const drawn = editor.features.filter((f) => f.properties.status !== 'rejected')
  const counts = new Map<string, number>()
  drawn.forEach((f) => counts.set(f.properties.layer, (counts.get(f.properties.layer) ?? 0) + 1))
  // Bio-indicator plants and sampling points are drawn by the « Sol » module, as part of what exists.
  const soilCounts: Record<SoilMarker, number> = {
    bioindicators: soil.observations.filter((o) => o.status !== 'draft' && o.lng != null && o.lat != null).length,
    samples: soil.samples.filter((s) => s.lng != null && s.lat != null).length,
  }
  counts.set('existing', (counts.get('existing') ?? 0) + soilCounts.bioindicators + soilCounts.samples)

  function soilParts(): Part[] {
    return SOIL_MARKERS.filter((marker) => soilCounts[marker] > 0).map((marker) => {
      const shown = soil.showOnMap && !hiddenSoil.includes(marker)
      return {
        key: `soil:${marker}`,
        label: t(`drawing.layers_panel.soil.${marker}`),
        color: SOIL_COLORS[marker],
        count: soilCounts[marker],
        hidden: !shown,
        toggle: () => {
          if (shown) return setHiddenSoil([...hiddenSoil, marker])
          // The « Sol » switch was off: turn it back on for this marker only.
          if (!soil.showOnMap) {
            soilActions.setShowOnMap(true)
            setHiddenSoil(SOIL_MARKERS.filter((m) => m !== marker))
          } else {
            setHiddenSoil(hiddenSoil.filter((m) => m !== marker))
          }
        },
      }
    })
  }

  function partsOf(layer: string): Part[] {
    const inLayer = drawn.filter((f) => f.properties.layer === layer)
    const parts: Part[] = []
    if (layer === 'plants' && planting) {
      const byStrata = new Map<string, number>()
      inLayer.filter(isPlantLike).forEach((f) => {
        const key = strataKey(plantStrata(f as MapFeature, planting))
        byStrata.set(key, (byStrata.get(key) ?? 0) + 1)
      })
      for (const key of [...STRATA, UNKNOWN_STRATA]) {
        const count = byStrata.get(key)
        if (!count) continue
        parts.push({
          key: `strata:${key}`,
          label: key === UNKNOWN_STRATA ? t('plants.legend.unknown_strata') : strataLabel(key),
          color: key === UNKNOWN_STRATA ? '#6b665c' : STRATA_COLORS[key as keyof typeof STRATA_COLORS],
          count,
          hidden: hiddenStrata.includes(key),
          toggle: () => setHiddenStrata(toggled(hiddenStrata, key)),
        })
      }
    }
    const byKind = new Map<string, { count: number; color: string }>()
    inLayer.filter((f) => !isPlantLike(f) && f.properties.kind).forEach((f) => {
      const kind = f.properties.kind as string
      const entry = byKind.get(kind) ?? { count: 0, color: featureColor(f) }
      entry.count += 1
      byKind.set(kind, entry)
    })
    const kinds = [...byKind.entries()]
      .map(([kind, { count, color }]) => ({ kind, count, color, label: t(`editor.kinds.${kind}`) }))
      .sort((a, b) => a.label.localeCompare(b.label, 'fr'))
    for (const { kind, count, color, label } of kinds) {
      parts.push({
        key: `kind:${kind}`, label, color, count,
        hidden: hiddenKinds.includes(kind),
        toggle: () => setHiddenKinds(toggled(hiddenKinds, kind)),
      })
    }
    if (layer === 'existing') parts.push(...soilParts())
    return parts
  }

  const soilHidden = (soilCounts.bioindicators > 0 || soilCounts.samples > 0) && (hiddenSoil.length > 0 || !soil.showOnMap)
  const somethingHidden = hidden.length > 0 || hiddenKinds.length > 0 || hiddenStrata.length > 0 || !photos.showOnMap || soilHidden

  return (
    <div className="space-y-3">
      <p className="text-sm text-loam-600">{t('drawing.layers_panel.intro')}</p>
      <ul className="divide-y divide-loam-100">
        {DESIGN_LAYERS.map((layer) => {
          const visible = !hidden.includes(layer)
          const parts = partsOf(layer)
          const open = opened.includes(layer)
          return (
            <li key={layer}>
              <div className="flex items-center">
                <ToggleRow
                  shown={visible}
                  label={t(`editor.layers.${layer}`)}
                  ariaLabel={t('drawing.layers_panel.toggle', { layer: t(`editor.layers.${layer}`) })}
                  marker={<Dot color={LAYER_COLORS[layer] ?? layerColor(layer)} faded={!visible} />}
                  count={t('drawing.layers_panel.count', { count: counts.get(layer) ?? 0 })}
                  onClick={() => setHiddenLayers(toggled(hidden, layer))}
                  extra={layer === 'networks' && <ShieldAlert className="ml-1.5 inline h-3.5 w-3.5 text-loam-400" aria-hidden />}
                />
                {parts.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setOpened(toggled(opened, layer))}
                    aria-expanded={open}
                    aria-label={t(open ? 'drawing.layers_panel.fold' : 'drawing.layers_panel.unfold', { layer: t(`editor.layers.${layer}`) })}
                    className="ml-1 grid h-9 w-9 shrink-0 place-items-center rounded-md text-loam-500 hover:bg-loam-50"
                  >
                    <ChevronDown className={clsx('h-4 w-4 transition-transform', open && 'rotate-180')} aria-hidden />
                  </button>
                )}
                {parts.length === 0 && <span className="ml-1 w-9 shrink-0" aria-hidden />}
              </div>
              {open && parts.length > 0 && (
                <ul className={clsx('mb-2 ml-6 border-l border-loam-100 pl-2', !visible && 'opacity-50')}>
                  {parts.map((part) => (
                    <li key={part.key}>
                      <ToggleRow
                        shown={!part.hidden}
                        label={part.label}
                        ariaLabel={t('drawing.layers_panel.toggle', { layer: part.label })}
                        marker={<Dot color={part.color} faded={part.hidden} small />}
                        count={String(part.count)}
                        onClick={part.toggle}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </li>
          )
        })}
        {/* Not a design layer, but what one looks for here to clear the map. */}
        <li className="flex items-center">
          <ToggleRow
            shown={photos.showOnMap}
            label={t('soil_photos.toggle.layer')}
            ariaLabel={t('drawing.layers_panel.toggle', { layer: t('soil_photos.toggle.layer') })}
            marker={<Camera className={clsx('h-3.5 w-3.5 shrink-0 text-prune-600', !photos.showOnMap && 'opacity-30')} aria-hidden />}
            count={t('drawing.layers_panel.photos_count', { count: placedPhotos })}
            onClick={() => photoActions.setShowOnMap(!photos.showOnMap)}
          />
          <span className="ml-1 w-9 shrink-0" aria-hidden />
        </li>
      </ul>
      {somethingHidden && (
        <button type="button" onClick={() => { showEverything(); photoActions.setShowOnMap(true); soilActions.setShowOnMap(true) }} className="text-sm font-medium text-prune-700 hover:underline">
          {t('drawing.layers_panel.show_all')}
        </button>
      )}
      <p className="flex items-start gap-1.5 text-sm text-loam-500">
        <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        {t('drawing.layers_panel.sensitive')}
      </p>
    </div>
  )
}

function Dot({ color, faded, small = false }: { color: string; faded: boolean; small?: boolean }) {
  return (
    <span
      className={clsx('shrink-0 rounded-full ring-2 ring-white', small ? 'h-2.5 w-2.5' : 'h-3.5 w-3.5', faded && 'opacity-30')}
      style={{ background: color }}
    />
  )
}

function ToggleRow({ shown, label, ariaLabel, marker, count, onClick, extra }: {
  shown: boolean; label: string; ariaLabel: string; marker: ReactNode; count: string; onClick: () => void; extra?: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={shown}
      aria-label={ariaLabel}
      className="flex w-full min-w-0 flex-1 items-center gap-3 px-1 py-2 text-left hover:bg-loam-50"
    >
      {marker}
      <span className={clsx('min-w-0 flex-1 truncate text-sm', shown ? 'text-loam-900' : 'text-loam-400 line-through decoration-loam-300')}>
        {label}
        {extra}
      </span>
      <span className="shrink-0 text-sm text-loam-400">{count}</span>
      {shown ? <Eye className="h-4 w-4 shrink-0 text-loam-500" /> : <EyeOff className="h-4 w-4 shrink-0 text-loam-400" />}
    </button>
  )
}
