import { ChevronRight, Shovel, X } from 'lucide-react'
import * as maplibregl from 'maplibre-gl'
import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { strataLabel } from '@/components/plants/format'
import { t } from '@/lib/i18n'
import { useEditor } from '@/map/editor/EditorContext'
import { FEATURES_SOURCE } from '@/map/layers/features'
import { useLinkedPhotos } from '@/map/photos/linked'
import { PhotoGallery } from '@/map/photos/PhotoGallery'
import { plantPeek, usePlantPeek } from '@/map/plants/peek'
import { numberProperty } from '@/map/plants/properties'
import { usePlanting } from '@/map/plants/store'
import { plantStrata, STRATA_COLORS, StrataDot } from '@/map/plants/strata'
import { inkOn } from '@/map/plants/strataColors'
import { useMediaQuery } from '@/lib/useMediaQuery'
import type { MapFeature } from '@/types'

const MOBILE = '(max-width: 767px)'

/** Where a plant stands (its point, or the middle of its crown). */
function plantLngLat(feature: MapFeature): [number, number] | null {
  const g = feature.geometry
  if (g.type === 'Point') return [g.coordinates[0], g.coordinates[1]]
  if (g.type === 'Polygon') {
    const ring = g.coordinates[0].slice(0, -1)
    return [ring.reduce((s, c) => s + c[0], 0) / ring.length, ring.reduce((s, c) => s + c[1], 0) / ring.length]
  }
  return null
}

/**
 * A click on a plant opens a small card next to it (a bottom card on
 * phones): its photos, species and variety, strata, planting year, and its
 * number on the plan. A click on a photo or on the name opens the full
 * inspector.
 */
export default function PlantPeekOverlay() {
  const editor = useEditor()
  const { instance, select, selectedId, drawing } = editor
  const peekedId = usePlantPeek()
  const feature = peekedId != null ? editor.features.find((f) => f.properties.id === peekedId) ?? null : null
  const mobile = useMediaQuery(MOBILE)

  // Gone (deleted, map changed), drawing, or the inspector opened: the card closes.
  useEffect(() => {
    if (peekedId != null && !feature) plantPeek.close()
  }, [peekedId, feature])
  useEffect(() => {
    if (drawing || selectedId != null) plantPeek.close()
  }, [drawing, selectedId])
  useEffect(() => () => plantPeek.close(), [])

  useEffect(() => {
    if (peekedId == null) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && plantPeek.close()
    window.addEventListener('keydown', onKey)
    // The plant stays highlighted while its card is open.
    instance.setFeatureState({ source: FEATURES_SOURCE, id: peekedId }, { selected: true })
    return () => {
      window.removeEventListener('keydown', onKey)
      if (instance.getSource(FEATURES_SOURCE)) instance.setFeatureState({ source: FEATURES_SOURCE, id: peekedId }, { selected: false })
    }
  }, [instance, peekedId])

  if (!feature) return null
  const lngLat = plantLngLat(feature)
  if (!lngLat) return null
  const openDetails = () => {
    plantPeek.close()
    select(feature.properties.id)
  }
  const card = <PlantCard feature={feature} onOpen={openDetails} onClose={plantPeek.close} mobile={mobile} />
  return mobile
    ? <div className="absolute inset-x-2 bottom-14 z-30">{card}</div>
    : <DesktopPopup lngLat={lngLat} featureId={feature.properties.id}>{card}</DesktopPopup>
}

function DesktopPopup({ lngLat, featureId, children }: { lngLat: [number, number]; featureId: number; children: ReactNode }) {
  const { instance } = useEditor()
  const [container] = useState(() => document.createElement('div'))
  const [lng, lat] = lngLat

  useEffect(() => {
    const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, maxWidth: 'none', offset: 14, className: 'plant-peek' })
      .setDOMContent(container)
      .setLngLat([lng, lat])
      .addTo(instance)
    // The card draws its own frame, rounded like the app's cards, with no tip.
    const element = popup.getElement()
    const content = element?.querySelector<HTMLElement>('.maplibregl-popup-content')
    if (content) Object.assign(content.style, { padding: '0', background: 'transparent', boxShadow: 'none' })
    const tip = element?.querySelector<HTMLElement>('.maplibregl-popup-tip')
    if (tip) tip.style.display = 'none'
    // Once its photos are in, the card must be whole on screen, clear of the
    // drawing toolbar on top and of the inspector's side: the map pans if needed.
    const reveal = window.setTimeout(() => {
      if (!element) return
      const box = element.getBoundingClientRect()
      const frame = instance.getContainer().getBoundingClientRect()
      const margin = { top: 72, right: 72, bottom: 24, left: 24 }
      const dx = box.left < frame.left + margin.left ? box.left - frame.left - margin.left
        : box.right > frame.right - margin.right ? box.right - frame.right + margin.right : 0
      const dy = box.top < frame.top + margin.top ? box.top - frame.top - margin.top
        : box.bottom > frame.bottom - margin.bottom ? box.bottom - frame.bottom + margin.bottom : 0
      if (dx || dy) instance.panBy([dx, dy], { duration: 300 })
    }, 350)
    return () => {
      window.clearTimeout(reveal)
      popup.remove()
    }
  }, [instance, container, featureId, lng, lat])

  return createPortal(children, container)
}

function PlantCard({ feature, onOpen, onClose, mobile }: { feature: MapFeature; onOpen: () => void; onClose: () => void; mobile: boolean }) {
  const editor = useEditor()
  const { data } = usePlanting(editor.map.id)
  const photos = useLinkedPhotos(editor.map.id, feature.properties.id, numberProperty(feature, 'cover_photo_id'))
  const speciesId = numberProperty(feature, 'species_id')
  const varietyId = numberProperty(feature, 'variety_id')
  const species = speciesId != null ? data?.species[String(speciesId)] : undefined
  const variety = varietyId != null ? data?.varieties[String(varietyId)] : undefined
  const strata = plantStrata(feature, data)
  const number = numberProperty(feature, 'number')
  const plantedOn = typeof feature.properties.planted_on === 'string' ? feature.properties.planted_on : null
  const plantedYear = plantedOn && feature.properties.planted_on_precision !== 'unknown' ? Number(plantedOn.slice(0, 4)) : null

  const name = species ? species.commonName ?? species.latinName : feature.properties.name || t('plant_peek.no_species')
  // The variety has its own line: the latin name stays the species'.
  const latin = species?.latinName
  const hasPhotos = (photos?.length ?? 0) > 0
  const titleId = `plant-peek-${feature.properties.id}`

  return (
    <div className={mobile ? 'relative w-full' : 'relative w-72'} role="dialog" aria-labelledby={titleId}>
      {number != null && (
        <span className="absolute -top-3 left-3 z-10 rounded-full px-2.5 py-0.5 text-sm font-semibold tabular-nums shadow ring-2 ring-white"
          style={strata ? { background: STRATA_COLORS[strata], color: inkOn(STRATA_COLORS[strata]) } : undefined}
          title={t('plant_feature.number')}>
          {number}
        </span>
      )}
      <div className={'overflow-hidden rounded-2xl bg-white text-loam-800 shadow-xl ring-1 ring-loam-200' + (mobile && hasPhotos ? ' flex' : '')}>
        {hasPhotos && photos && (
          <PhotoGallery mapId={editor.map.id} photos={photos} onOpen={onOpen} openLabel={t('plant_peek.open')}
            className={mobile ? 'min-h-36 w-36 shrink-0 self-stretch' : 'aspect-[4/3]'} />
        )}
        <button type="button" onClick={onClose} aria-label={t('common.close')}
          className="absolute right-2 top-2 rounded-full bg-white/90 p-1.5 text-loam-700 shadow hover:bg-white">
          <X className="h-4 w-4" />
        </button>
        <div className={'min-w-0 flex-1 px-4 pb-3.5 ' + (number != null && !hasPhotos ? 'pt-5' : 'pt-3') + (hasPhotos && !mobile ? '' : ' pr-11')}>
          <button type="button" onClick={onOpen} className="group block max-w-full text-left">
            <span id={titleId} className="block font-serif text-lg leading-snug text-loam-900 group-hover:underline">{name}</span>
            {variety && <span className="block text-sm text-loam-700">‘{variety.name}’</span>}
            {latin && <span className="block truncate text-sm italic text-loam-500">{latin}</span>}
          </button>
          {(strata || plantedYear != null) && (
            <ul className="mt-2 space-y-1 text-sm text-loam-700">
              {strata && <li className="flex items-center gap-2"><StrataDot strata={strata} />{strataLabel(strata)}</li>}
              {plantedYear != null && (
                <li className="flex items-center gap-2">
                  <Shovel className="h-3.5 w-3.5 shrink-0 text-leaf-700" aria-hidden="true" />
                  {t('plant_peek.planted_in', { year: plantedYear })}
                </li>
              )}
            </ul>
          )}
          <button type="button" onClick={onOpen} className="mt-2.5 inline-flex items-center gap-0.5 text-sm font-medium text-prune-700 hover:underline">
            {t('plant_peek.details')}<ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
