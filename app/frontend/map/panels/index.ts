import { Camera, FlaskConical, Layers3, MapPinned } from 'lucide-react'
import type { EditorPanel, EditorSlot, InspectorSection } from '@/map/panels/registry'
import TerrainPanel from '@/map/panels/TerrainPanel'
import ElementsPanel from '@/map/panels/ElementsPanel'
import PhotosPanel from '@/map/photos/PhotosPanel'
import PhotosInspector from '@/map/photos/PhotosInspector'
import PhotosOverlay from '@/map/photos/PhotosOverlay'
import SoilPanel from '@/map/soil/SoilPanel'
import SoilOverlay from '@/map/soil/SoilOverlay'

// Register editor panels here (one line per panel, keep groups together).
export const PANELS: EditorPanel[] = [
  { id: 'terrain', label: 'editor.panels.terrain', icon: MapPinned, group: 'map', component: TerrainPanel, order: 10 },
  { id: 'soil', label: 'soil.panel_label', icon: FlaskConical, group: 'understand', component: SoilPanel, order: 60 },
  { id: 'photos', label: 'soil_photos.panel_label', icon: Camera, group: 'understand', component: PhotosPanel, order: 70 },
  { id: 'elements', label: 'editor.panels.elements', icon: Layers3, group: 'design', component: ElementsPanel, order: 90 },
]

// Register inspector sections for a selected feature here.
export const INSPECTOR_SECTIONS: InspectorSection[] = [
  { id: 'photos', applies: () => true, component: PhotosInspector, order: 70 },
]

// Top bar actions (right side), e.g. share, export.
export const HEADER_ACTIONS: EditorSlot[] = []

// Overlays over the map, e.g. drawing toolbar, identify popup, drafts review bar.
export const OVERLAYS: EditorSlot[] = [
  { id: 'photos', component: PhotosOverlay, order: 70 },
  { id: 'soil', component: SoilOverlay, order: 60 },
]
