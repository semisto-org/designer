import type { LucideIcon } from 'lucide-react'
import type { ComponentType } from 'react'
import type { MapFeature, MapStage } from '@/types'

/**
 * Side panels of the map editor, grouped by the four steps of the journey
 * (observe, map, design, plant), plus `share` (exchange and follow, without
 * a number). Each feature area registers its panels in `panels/index.ts`;
 * the editor renders the rail and the open panel.
 */
export type PanelGroup = MapStage | 'share'

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
  /**
   * Opens in a centered modal on wide screens (MODAL_PANEL_QUERY) instead of
   * the side panel, for panels meant to be read with care. The component
   * checks the same query to lay itself out for the modal.
   */
  modal?: boolean
  /** Opened from elsewhere (the guide card, the steps), not listed in the rail. */
  hiddenFromRail?: boolean
}

/** Screens wide enough for modal panels (Tailwind's `lg`). */
export const MODAL_PANEL_QUERY = '(min-width: 1024px)'

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
