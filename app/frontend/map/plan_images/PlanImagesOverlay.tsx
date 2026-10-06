import { usePage } from '@inertiajs/react'
import * as maplibregl from 'maplibre-gl'
import type { GeoJSONSource, MapMouseEvent, MapTouchEvent } from 'maplibre-gl'
import { useEffect, useLayoutEffect, useRef } from 'react'
import { t } from '@/lib/i18n'
import { useEditor } from '@/map/editor/EditorContext'
import { placePlanImages, syncPlanImages } from '@/map/plan_images/layers'
import PlacingBar from '@/map/plan_images/PlacingBar'
import { contains, corners, type LngLat, moved, type Pose, rotatedTowards, scaledTo } from '@/map/plan_images/pose'
import { type PlanImage, planImagesStore, usePlanImages } from '@/map/plan_images/store'

const NONE: PlanImage[] = []
const FRAME = 'plan-image-frame'
// How far above the top edge the rotation handle sits, in pixels.
const ROTATION_HANDLE_PX = 36

/** The map's plan images (prop `planImages` of maps/show). */
function usePropPlanImages(): PlanImage[] {
  return usePage<{ planImages?: PlanImage[] }>().props.planImages ?? NONE
}

/**
 * Draws the map's plan images under the drawing, whether the panel is open
 * or not, and, while one is being placed, its frame and handles: drag the
 * image to move it, a corner to scale it, the round handle to turn it.
 */
export default function PlanImagesOverlay() {
  const { instance, map, regionLayers, canEdit } = useEditor()
  const props = usePropPlanImages()
  const { mapId, images, placingId } = usePlanImages()

  useLayoutEffect(() => {
    planImagesStore.init(map.id, props)
  }, [map.id, props])

  useEffect(() => {
    if (mapId !== map.id) return
    syncPlanImages(instance, images)
    placePlanImages(instance, images, regionLayers)
  }, [instance, images, mapId, map.id, regionLayers])

  // Base maps and overlays come and go: stay right on top of the base.
  const latest = useRef(images)
  latest.current = images
  useEffect(() => {
    const place = () => placePlanImages(instance, latest.current, regionLayers)
    instance.on('styledata', place)
    return () => {
      instance.off('styledata', place)
    }
  }, [instance, regionLayers])

  // Leaving the editor removes everything we added.
  useEffect(() => () => {
    if (instance.getStyle()) syncPlanImages(instance, [])
  }, [instance])

  const placing = canEdit ? images.find((image) => image.id === placingId) ?? null : null
  return placing ? <PlacingHandles image={placing} /> : null
}

function PlacingHandles({ image }: { image: PlanImage }) {
  const { instance, notify } = useEditor()
  const pose = useRef<Pose>(image)
  const active = useRef<'move' | 'scale' | 'rotate' | null>(null)
  const markers = useRef<{ corners: maplibregl.Marker[]; rotate: maplibregl.Marker } | null>(null)
  const draggedCorner = useRef<number | null>(null)
  const id = image.id

  // Outside a gesture the store speaks (a save, an undo after a refusal).
  if (!active.current) pose.current = image

  const save = (next: Pose) => {
    planImagesStore
      .update(id, { centerLng: next.centerLng, centerLat: next.centerLat, widthM: next.widthM, rotation: next.rotation })
      .catch((error: Error) => notify(error.message, 'error'))
  }

  // Frame and handles follow the pose and the view.
  const layout = () => {
    const current = pose.current
    const quad = corners(current)
    const frame = instance.getSource(FRAME) as GeoJSONSource | undefined
    frame?.setData({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[...quad, quad[0]]] } })
    if (!markers.current) return
    markers.current.corners.forEach((marker, index) => {
      if (draggedCorner.current !== index) marker.setLngLat(quad[index])
    })
    if (active.current !== 'rotate') markers.current.rotate.setLngLat(rotationPoint(quad))
  }

  // Above the middle of the top edge, at a fixed distance on screen.
  const rotationPoint = (quad: LngLat[]): LngLat => {
    const top = instance.project([(quad[0][0] + quad[1][0]) / 2, (quad[0][1] + quad[1][1]) / 2])
    const center = instance.project([pose.current.centerLng, pose.current.centerLat])
    const dx = top.x - center.x
    const dy = top.y - center.y
    const length = Math.hypot(dx, dy) || 1
    const point = instance.unproject([top.x + (dx / length) * ROTATION_HANDLE_PX, top.y + (dy / length) * ROTATION_HANDLE_PX])
    return [point.lng, point.lat]
  }

  const apply = (next: Pose) => {
    pose.current = next
    planImagesStore.preview(id, { centerLng: next.centerLng, centerLat: next.centerLat, widthM: next.widthM, rotation: next.rotation })
    layout()
  }

  // Install the frame and the handles once per placed image.
  useEffect(() => {
    if (!instance.getSource(FRAME)) instance.addSource(FRAME, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
    if (!instance.getLayer(FRAME)) {
      instance.addLayer({ id: FRAME, type: 'line', source: FRAME, paint: { 'line-color': '#5b5781', 'line-width': 2, 'line-dasharray': [2, 1.5] } })
    }

    const handle = (shape: string, label: string) => {
      const element = document.createElement('button')
      element.type = 'button'
      element.className = `${shape} border-2 border-solid border-prune-600 shadow`
      element.dataset.planImageHandle = label
      return element
    }
    // MapLibre labels its markers « Map marker »: say what each handle does.
    const label = (marker: maplibregl.Marker, key: string) => marker.getElement().setAttribute('aria-label', t(`plan_images.placing.${key}`))
    const cornerMarkers = [0, 1, 2, 3].map((index) => {
      const marker = new maplibregl.Marker({
        element: handle('h-3.5 w-3.5 rounded-sm bg-white cursor-nwse-resize', 'scale'),
        draggable: true,
      }).setLngLat([0, 0]).addTo(instance)
      marker.on('dragstart', () => {
        active.current = 'scale'
        draggedCorner.current = index
      })
      marker.on('drag', () => {
        const { lng, lat } = marker.getLngLat()
        apply(scaledTo(pose.current, [lng, lat]))
      })
      marker.on('dragend', () => {
        active.current = null
        draggedCorner.current = null
        layout()
        save(pose.current)
      })
      label(marker, 'scale_handle')
      if (index % 2 === 1) marker.getElement().classList.replace('cursor-nwse-resize', 'cursor-nesw-resize')
      return marker
    })
    const rotate = new maplibregl.Marker({
      element: handle('h-4 w-4 rounded-full bg-prune-600 ring-2 ring-white cursor-grab', 'rotate'),
      draggable: true,
    }).setLngLat([0, 0]).addTo(instance)
    label(rotate, 'rotate_handle')
    rotate.on('dragstart', () => { active.current = 'rotate' })
    rotate.on('drag', () => {
      const { lng, lat } = rotate.getLngLat()
      apply(rotatedTowards(pose.current, [lng, lat]))
    })
    rotate.on('dragend', () => {
      active.current = null
      layout()
      save(pose.current)
    })
    markers.current = { corners: cornerMarkers, rotate }
    layout()

    // Dragging the image itself moves it (and not the map).
    let from: LngLat | null = null
    const start = (event: MapMouseEvent | MapTouchEvent) => {
      if ('points' in event && event.points.length !== 1) return
      const point: LngLat = [event.lngLat.lng, event.lngLat.lat]
      if (!contains(pose.current, point)) return
      event.preventDefault()
      from = point
      active.current = 'move'
      instance.getCanvas().style.cursor = 'grabbing'
    }
    const drag = (event: MapMouseEvent | MapTouchEvent) => {
      const point: LngLat = [event.lngLat.lng, event.lngLat.lat]
      if (!from) {
        if (!('points' in event)) instance.getCanvas().style.cursor = contains(pose.current, point) ? 'move' : ''
        return
      }
      apply(moved(pose.current, from, point))
      from = point
    }
    const end = () => {
      if (!from) return
      from = null
      active.current = null
      instance.getCanvas().style.cursor = ''
      save(pose.current)
    }
    instance.on('mousedown', start)
    instance.on('touchstart', start)
    instance.on('mousemove', drag)
    instance.on('touchmove', drag)
    instance.on('mouseup', end)
    instance.on('touchend', end)
    instance.on('move', layout)

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') planImagesStore.place(null)
    }
    window.addEventListener('keydown', onKey)

    return () => {
      window.removeEventListener('keydown', onKey)
      instance.off('mousedown', start)
      instance.off('touchstart', start)
      instance.off('mousemove', drag)
      instance.off('touchmove', drag)
      instance.off('mouseup', end)
      instance.off('touchend', end)
      instance.off('move', layout)
      cornerMarkers.forEach((marker) => marker.remove())
      rotate.remove()
      markers.current = null
      instance.getCanvas().style.cursor = ''
      if (instance.getStyle()) {
        if (instance.getLayer(FRAME)) instance.removeLayer(FRAME)
        if (instance.getSource(FRAME)) instance.removeSource(FRAME)
      }
    }
  }, [instance, id])

  // A pose changed from elsewhere (the bar's rotation field, a refused save).
  useEffect(() => {
    if (!active.current) layout()
  }, [image.centerLng, image.centerLat, image.widthM, image.rotation])

  return <PlacingBar image={image} />
}
