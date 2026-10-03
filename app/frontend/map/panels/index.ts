import { ClipboardList, Layers3, MapPinned, Sprout } from 'lucide-react'
import type { EditorPanel, EditorSlot, InspectorSection } from '@/map/panels/registry'
import TerrainPanel from '@/map/panels/TerrainPanel'
import ElementsPanel from '@/map/panels/ElementsPanel'
import PalettePanel from '@/map/plants/PalettePanel'
import PlantListPanel from '@/map/plants/PlantListPanel'
import PlantSection from '@/map/plants/PlantSection'
import ObservationsSection from '@/map/plants/ObservationsSection'
import PatchSection from '@/map/plants/PatchSection'
import PlantsOverlay from '@/map/plants/PlantsOverlay'
import { isPatch, isPlant } from '@/map/plants/properties'

// Register editor panels here (one line per panel, keep groups together).
export const PANELS: EditorPanel[] = [
  { id: 'terrain', label: 'editor.panels.terrain', icon: MapPinned, group: 'map', component: TerrainPanel, order: 10 },
  { id: 'palette', label: 'editor.panels.palette', icon: Sprout, group: 'design', component: PalettePanel, order: 20 },
  { id: 'plant-list', label: 'editor.panels.plant_list', icon: ClipboardList, group: 'design', component: PlantListPanel, order: 30 },
  { id: 'elements', label: 'editor.panels.elements', icon: Layers3, group: 'design', component: ElementsPanel, order: 90 },
]

// Register inspector sections for a selected feature here.
export const INSPECTOR_SECTIONS: InspectorSection[] = [
  { id: 'plant', applies: isPlant, component: PlantSection, order: 20 },
  { id: 'plant-observations', applies: isPlant, component: ObservationsSection, order: 21 },
  { id: 'patch', applies: isPatch, component: PatchSection, order: 20 },
]

// Top bar actions (right side), e.g. share, export.
export const HEADER_ACTIONS: EditorSlot[] = []

// Overlays over the map, e.g. drawing toolbar, identify popup, drafts review bar.
export const OVERLAYS: EditorSlot[] = [
  { id: 'plants', component: PlantsOverlay, order: 20 },
]
