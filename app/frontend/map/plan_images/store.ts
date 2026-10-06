import { useSyncExternalStore } from 'react'
import { api } from '@/lib/api'
import type { Pose } from '@/map/plan_images/pose'

/**
 * The plan images of the open map (« Fonds de plan »), shared by the panel
 * and the overlay that draws them. The list comes with the page (prop
 * `planImages` of maps/show); writes answer with the refreshed list.
 * `placingId` is the image being placed with the mouse.
 */
export type PlanImage = Pose & {
  id: number
  name: string
  opacity: number
  visible: boolean
  position: number
  imageUrl: string
}

export type PlanImagesResponse = { planImage?: PlanImage; planImages: PlanImage[] }

type State = { mapId: number | null; images: PlanImage[]; placingId: number | null }

let state: State = { mapId: null, images: [], placingId: null }
const listeners = new Set<() => void>()

function emit(next: Partial<State>) {
  state = { ...state, ...next }
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function usePlanImages(): State {
  return useSyncExternalStore(subscribe, () => state)
}

// Writes still on their way, per image: a slow answer must not undo a later move.
const pending = new Map<number, number>()

export const planImagesStore = {
  init(mapId: number, images: PlanImage[]) {
    if (state.mapId === mapId) return
    pending.clear()
    emit({ mapId, images, placingId: null })
  },

  place(id: number | null) {
    emit({ placingId: id })
  },

  /** Shows a change at once (a drag in progress, a slider), without saving it. */
  preview(id: number, changes: Partial<PlanImage>) {
    emit({ images: state.images.map((image) => (image.id === id ? { ...image, ...changes } : image)) })
  },

  /** Shows a change at once and saves it. Throws the server's message when refused. */
  async update(id: number, changes: Partial<Pick<PlanImage, 'name' | 'centerLng' | 'centerLat' | 'widthM' | 'rotation' | 'opacity' | 'visible'>>) {
    const mapId = state.mapId
    const before = state.images.find((image) => image.id === id)
    this.preview(id, changes)
    const count = (pending.get(id) ?? 0) + 1
    pending.set(id, count)
    try {
      const data = await api<PlanImagesResponse>(`/maps/${mapId}/plan_images/${id}`, {
        method: 'PATCH',
        body: {
          plan_image: {
            name: changes.name, center_lng: changes.centerLng, center_lat: changes.centerLat, width_m: changes.widthM,
            rotation: changes.rotation, opacity: changes.opacity, visible: changes.visible,
          },
        },
      })
      // Only the last write of an image speaks for it.
      if (state.mapId === mapId && pending.get(id) === count && data.planImage) this.preview(id, data.planImage)
    } catch (error) {
      if (state.mapId === mapId && pending.get(id) === count && before) this.preview(id, before)
      throw error
    } finally {
      if (pending.get(id) === count) pending.delete(id)
    }
  },

  async create(form: FormData): Promise<PlanImage> {
    const mapId = state.mapId
    const data = await api<PlanImagesResponse>(`/maps/${mapId}/plan_images`, { method: 'POST', body: form })
    if (state.mapId === mapId) emit({ images: data.planImages })
    return data.planImage!
  },

  async remove(id: number) {
    const mapId = state.mapId
    const data = await api<PlanImagesResponse>(`/maps/${mapId}/plan_images/${id}`, { method: 'DELETE' })
    if (state.mapId === mapId) emit({ images: data.planImages, placingId: state.placingId === id ? null : state.placingId })
  },
}
