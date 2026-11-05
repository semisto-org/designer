import type { SectorGroup } from '@/map/sectors/sectors'
import type { Moment } from '@/map/time/moment'
import type { DesignMode } from '@/map/time/mode'
import type { Season } from '@/map/time/growth'

/** Where the map looks from: what MapLibre needs to come back to it. */
export type PresentationCamera = { center: [number, number]; zoom: number; bearing: number; pitch: number }

/**
 * A view of the 3D relief (/maps/:id/relief): where the camera stands and
 * looks (scene metres, absent: the default view), the ground drawn, the
 * tab open (« night » shows the cold air), the sun and the plants' year.
 */
export type ReliefView = {
  position?: [number, number, number]
  target?: [number, number, number]
  base?: string
  exaggeration?: number
  tab?: 'view' | 'rain' | 'sun' | 'night'
  sun?: { mode: 'off' | 'instant' | 'day'; date: 'winter' | 'equinox' | 'summer' | 'today'; minutes: number }
  year?: number
}

/**
 * One view of the map, as a step brings it back. A key left out means the
 * plain state: everything shown, no panel, no sectors, today, the retained variant.
 */
export type PresentationView = {
  camera?: PresentationCamera
  panel?: string
  hiddenLayers?: string[]
  hiddenKinds?: string[]
  hiddenStrata?: string[]
  /** One tag shown on its own (« Calques »), such as a flow; absent: every element. */
  tag?: string
  /** The project variant shown (map/variants); absent: the retained one. */
  variantId?: number
  /** The sector groups kept around the terrain; absent: none. */
  sectors?: SectorGroup[]
  moment?: Moment
  /** « Existant » or « Projet »; absent: what the moment implies. */
  mode?: DesignMode
  shade?: Season
  featureId?: number
  /** The step is shown in the 3D relief rather than on the map. */
  relief?: ReliefView
}

export type PresentationStep = {
  id: string
  /** The template step it came from (« wind », « soil »…). */
  key?: string
  title: string
  /** The presenter's own words: what to say on this view. */
  note?: string
  /** Shown to this client; unticked steps are skipped while presenting. */
  shown: boolean
  /** The view was captured on this map (a template's default view is not). */
  captured: boolean
  view: PresentationView
}

export type Presentation = {
  id: number
  name: string
  templateKey: string | null
  steps: PresentationStep[]
  lockVersion: number
  updatedAt: string | null
}

export type PresentationTemplateInfo = { key: string; name: string; count: number }

export type PresentationsPayload = { presentations: Presentation[]; templates: PresentationTemplateInfo[]; id?: number; message?: string }
