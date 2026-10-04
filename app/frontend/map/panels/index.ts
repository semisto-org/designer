import { Bot, ClipboardList, CloudSun, Globe, Handshake, Layers3, ListChecks, Map as MapIcon, MapPinned, Mountain, PiggyBank, Route, Sprout } from 'lucide-react'
import type { EditorPanel, EditorSlot, InspectorSection } from '@/map/panels/registry'
import TerrainPanel from '@/map/panels/TerrainPanel'
import ElementsPanel from '@/map/panels/ElementsPanel'
import CollabOverlay from '@/collab/CollabOverlay'
import DiscussionSection from '@/collab/DiscussionSection'
import DiscussionsPanel from '@/collab/DiscussionsPanel'
import { DiscussionsIcon } from '@/collab/DiscussionsIcon'
import PublishPanel from '@/collab/PublishPanel'
import ShareButton from '@/collab/ShareButton'
import JourneyPanel from '@/map/panels/JourneyPanel'
import JourneyOverlay from '@/map/panels/JourneyOverlay'
import ProjectPanel from '@/map/panels/ProjectPanel'
import ActionsPanel from '@/map/panels/ActionsPanel'
import LayersPanel from '@/map/panels/LayersPanel'
import RegionLayersOverlay from '@/map/data/RegionLayersOverlay'
import IdentifyOverlay from '@/map/data/IdentifyOverlay'
import AiJournalPanel from '@/map/panels/AiJournalPanel'
import DraftsBar from '@/map/drafts/DraftsBar'
import DraftReviewSection from '@/map/drafts/DraftReviewSection'
import ReliefPanel from '@/map/panels/ReliefPanel'
import ReadOnlyNotice from '@/map/panels/ReadOnlyNotice'
import HelpAction from '@/map/panels/HelpAction'
import PalettePanel from '@/map/plants/PalettePanel'
import PlantListPanel from '@/map/plants/PlantListPanel'
import PlantSection from '@/map/plants/PlantSection'
import ObservationsSection from '@/map/plants/ObservationsSection'
import PatchSection from '@/map/plants/PatchSection'
import PlantsOverlay from '@/map/plants/PlantsOverlay'
import { isPatch, isPlant } from '@/map/plants/properties'
import ClimatePanel from '@/map/panels/ClimatePanel'
import FinancesPanel from '@/map/panels/FinancesPanel'

// Register editor panels here (one line per panel, keep groups together).
export const PANELS: EditorPanel[] = [
  { id: 'journey', label: 'journey.panel.title', icon: Route, group: 'map', component: JourneyPanel, order: 1 },
  { id: 'project', label: 'journey.project.title', icon: ClipboardList, group: 'map', component: ProjectPanel, order: 5 },
  { id: 'terrain', label: 'editor.panels.terrain', icon: MapPinned, group: 'map', component: TerrainPanel, order: 10 },
  { id: 'layers', label: 'map_data.panels.layers', icon: MapIcon, group: 'map', component: LayersPanel, order: 20 },
  { id: 'relief', label: 'relief.panel', icon: Mountain, group: 'understand', component: ReliefPanel, order: 30 },
  { id: 'climate', label: 'climate.panel_title', icon: CloudSun, group: 'understand', component: ClimatePanel, order: 40 },
  { id: 'palette', label: 'editor.panels.palette', icon: Sprout, group: 'design', component: PalettePanel, order: 20 },
  { id: 'plant-list', label: 'editor.panels.plant_list', icon: ListChecks, group: 'design', component: PlantListPanel, order: 30 },
  { id: 'finances', label: 'finances.panel_title', icon: PiggyBank, group: 'design', component: FinancesPanel, order: 80 },
  { id: 'elements', label: 'editor.panels.elements', icon: Layers3, group: 'design', component: ElementsPanel, order: 90 },
  { id: 'discussions', label: 'collab.panels.discussions', icon: DiscussionsIcon, group: 'share', component: DiscussionsPanel, order: 10 },
  { id: 'publish', label: 'collab.panels.publish', icon: Globe, group: 'share', component: PublishPanel, requires: 'owner', order: 20 },
  { id: 'actions', label: 'journey.requests.panel_title', icon: Handshake, group: 'share', component: ActionsPanel, order: 20 },
  { id: 'ai-journal', label: 'ai_journal.title', icon: Bot, group: 'share', component: AiJournalPanel, requires: 'owner', order: 80 },
]

// Register inspector sections for a selected feature here.
export const INSPECTOR_SECTIONS: InspectorSection[] = [
  { id: 'discussion', applies: () => true, component: DiscussionSection, order: 90 },
  { id: 'draft-review', applies: (f) => f.properties.status === 'draft', component: DraftReviewSection, order: 5 },
  { id: 'plant', applies: isPlant, component: PlantSection, order: 20 },
  { id: 'plant-observations', applies: isPlant, component: ObservationsSection, order: 21 },
  { id: 'patch', applies: isPatch, component: PatchSection, order: 20 },
]

// Top bar actions (right side), e.g. share, export.
export const HEADER_ACTIONS: EditorSlot[] = [
  { id: 'share', component: ShareButton, order: 80 },
  { id: 'read-only-notice', component: ReadOnlyNotice, order: 5 },
  { id: 'help', component: HelpAction, order: 95 },
]

// Overlays over the map, e.g. drawing toolbar, identify popup, drafts review bar.
export const OVERLAYS: EditorSlot[] = [
  { id: 'collab', component: CollabOverlay, order: 90 },
  { id: 'journey-chip', component: JourneyOverlay, order: 20 },
  { id: 'region-layers', component: RegionLayersOverlay, order: 0 },
  { id: 'identify', component: IdentifyOverlay, order: 40 },
  { id: 'drafts-bar', component: DraftsBar, order: 40 },
  { id: 'plants', component: PlantsOverlay, order: 20 },
]
