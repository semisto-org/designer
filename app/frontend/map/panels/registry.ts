import type { LucideIcon } from 'lucide-react'
import type { ComponentType } from 'react'
import type { MapFeature } from '@/types'

/**
 * Side panels of the map editor, grouped by the design cycle:
 * map (cartographier), understand (comprendre), design (concevoir),
 * share (partager et suivre). Each feature area registers its panels in
 * `panels/index.ts`; the editor renders the rail and the open panel.
 */
export type PanelGroup = 'map' | 'understand' | 'design' | 'share'

export type EditorPanel = {
  id: string
  /** i18n key of the label */
  label: string
  icon: LucideIcon
  group: PanelGroup
  component: ComponentType
  /** Hidden for viewers when 'editor'. */
  requires?: 'editor' | 'owner'
  /** Sort order inside its group. */
  order?: number
}

/**
 * Extra sections shown in the inspector of a selected feature (comments,
 * plant details, photos…). `applies` decides for which features.
 */
export type InspectorSection = {
  id: string
  applies: (feature: MapFeature) => boolean
  component: ComponentType<{ feature: MapFeature }>
  order?: number
}

/**
 * Components mounted inside the editor (with access to useEditor()):
 * - header actions render in the top bar, right side (share, export…);
 * - overlays render over the map (toolbars, popups, live presence…).
 */
export type EditorSlot = {
  id: string
  component: ComponentType
  order?: number
}
