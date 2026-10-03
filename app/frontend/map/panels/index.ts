import { ClipboardList, Handshake, Layers3, MapPinned, Route } from 'lucide-react'
import type { EditorPanel, EditorSlot, InspectorSection } from '@/map/panels/registry'
import TerrainPanel from '@/map/panels/TerrainPanel'
import ElementsPanel from '@/map/panels/ElementsPanel'
import JourneyPanel from '@/map/panels/JourneyPanel'
import JourneyOverlay from '@/map/panels/JourneyOverlay'
import ProjectPanel from '@/map/panels/ProjectPanel'
import ActionsPanel from '@/map/panels/ActionsPanel'

// Register editor panels here (one line per panel, keep groups together).
export const PANELS: EditorPanel[] = [
  { id: 'journey', label: 'journey.panel.title', icon: Route, group: 'map', component: JourneyPanel, order: 1 },
  { id: 'project', label: 'journey.project.title', icon: ClipboardList, group: 'map', component: ProjectPanel, order: 5 },
  { id: 'terrain', label: 'editor.panels.terrain', icon: MapPinned, group: 'map', component: TerrainPanel, order: 10 },
  { id: 'elements', label: 'editor.panels.elements', icon: Layers3, group: 'design', component: ElementsPanel, order: 90 },
  { id: 'actions', label: 'journey.requests.panel_title', icon: Handshake, group: 'share', component: ActionsPanel, order: 20 },
]

// Register inspector sections for a selected feature here.
export const INSPECTOR_SECTIONS: InspectorSection[] = []

// Top bar actions (right side), e.g. share, export.
export const HEADER_ACTIONS: EditorSlot[] = []

// Overlays over the map, e.g. drawing toolbar, identify popup, drafts review bar.
export const OVERLAYS: EditorSlot[] = [
  { id: 'journey-chip', component: JourneyOverlay, order: 20 },
]
