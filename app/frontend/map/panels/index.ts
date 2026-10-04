import { Eye, Layers3, MapPinned, TriangleAlert } from 'lucide-react'
import type { EditorPanel, EditorSlot, InspectorSection } from '@/map/panels/registry'
import TerrainPanel from '@/map/panels/TerrainPanel'
import ElementsPanel from '@/map/panels/ElementsPanel'
import AlertsPanel from '@/map/drawing/AlertsPanel'
import DrawingLayers from '@/map/drawing/DrawingLayers'
import DrawingToolbar from '@/map/drawing/DrawingToolbar'
import ElementSection, { appliesToElement } from '@/map/drawing/ElementSection'
import ExportMenu from '@/map/drawing/ExportMenu'
import LayersPanel from '@/map/drawing/LayersPanel'
import LiveSync from '@/map/drawing/LiveSync'

// Register editor panels here (one line per panel, keep groups together).
export const PANELS: EditorPanel[] = [
  { id: 'terrain', label: 'editor.panels.terrain', icon: MapPinned, group: 'map', component: TerrainPanel, order: 10 },
  { id: 'elements', label: 'editor.panels.elements', icon: Layers3, group: 'design', component: ElementsPanel, order: 90 },
  { id: 'drawing-layers', label: 'drawing.panels.layers', icon: Eye, group: 'design', component: LayersPanel, order: 20 },
  { id: 'drawing-alerts', label: 'drawing.panels.alerts', icon: TriangleAlert, group: 'design', component: AlertsPanel, order: 80 },
]

// Register inspector sections for a selected feature here.
export const INSPECTOR_SECTIONS: InspectorSection[] = [
  { id: 'drawing-element', applies: appliesToElement, component: ElementSection, order: 20 },
]

// Top bar actions (right side), e.g. share, export.
export const HEADER_ACTIONS: EditorSlot[] = [
  { id: 'drawing-export', component: ExportMenu, order: 60 },
]

// Overlays over the map, e.g. drawing toolbar, identify popup, drafts review bar.
export const OVERLAYS: EditorSlot[] = [
  { id: 'drawing-layers', component: DrawingLayers, order: 10 },
  { id: 'drawing-toolbar', component: DrawingToolbar, order: 40 },
  { id: 'drawing-live', component: LiveSync, order: 90 },
]
