import { Layers3, MapPinned } from 'lucide-react'
import type { EditorPanel, EditorSlot, InspectorSection } from '@/map/panels/registry'
import TerrainPanel from '@/map/panels/TerrainPanel'
import ElementsPanel from '@/map/panels/ElementsPanel'

// Register editor panels here (one line per panel, keep groups together).
export const PANELS: EditorPanel[] = [
  { id: 'terrain', label: 'editor.panels.terrain', icon: MapPinned, group: 'map', component: TerrainPanel, order: 10 },
  { id: 'elements', label: 'editor.panels.elements', icon: Layers3, group: 'design', component: ElementsPanel, order: 90 },
]

// Register inspector sections for a selected feature here.
export const INSPECTOR_SECTIONS: InspectorSection[] = []

// Top bar actions (right side), e.g. share, export.
export const HEADER_ACTIONS: EditorSlot[] = []

// Overlays over the map, e.g. drawing toolbar, identify popup, drafts review bar.
export const OVERLAYS: EditorSlot[] = []
