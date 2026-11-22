import { Bot, Camera, Waypoints, Compass, Target, Shovel, FileImage, Files, ClipboardList, CloudSun, Droplets, Eye, FlaskConical, Globe, Handshake, Layers3, ListChecks, Map as MapIcon, Receipt, MapPinned, Mountain, PiggyBank, Route, ShieldAlert, Sprout, Sun, TriangleAlert } from 'lucide-react'
import { Apple, Archive, GitBranch, Presentation, Trees } from 'lucide-react'
import { isAnnotationLayer } from '@/map/scenario'
import { appliesToCatchment, appliesToEarthworks, appliesToElement, appliesToFruitStore, appliesToGpsPoint, appliesToInfiltration, appliesToKeyline, appliesToLinks, appliesToPhase, appliesToProjectState, appliesToStorm, appliesToVariant, appliesToZone } from '@/map/panels/applies'
import { deferred } from '@/map/panels/deferred'
import { isSector } from '@/map/sectors/SectorsOverlay'
import { isLinkable as appliesToWaterSource } from '@/map/water/store'
import CanopyOverlay from '@/map/canopy/CanopyOverlay'
import type { EditorPanel, EditorSlot, InspectorSection } from '@/map/panels/registry'
import CollabOverlay from '@/collab/CollabOverlay'
import { DiscussionsIcon } from '@/collab/DiscussionsIcon'
import ShareButton from '@/collab/ShareButton'
import ChatToggle from '@/collab/chat/ChatToggle'
import EditorNotificationBell from '@/collab/chat/EditorNotificationBell'
import MapChat from '@/collab/chat/MapChat'
import WelcomeCard from '@/collab/welcome/WelcomeCard'
import JourneyOverlay from '@/map/panels/JourneyOverlay'
import TourOverlay from '@/map/tour/TourOverlay'
import FirstHourOverlay from '@/map/first_hour/FirstHourOverlay'
import RegionLayersOverlay from '@/map/data/RegionLayersOverlay'
import PhotoLimitOverlay from '@/map/data/PhotoLimitOverlay'
import IdentifyOverlay from '@/map/data/IdentifyOverlay'
import LegendOverlay from '@/map/data/LegendOverlay'
import AiProposalsOverlay from '@/map/drafts/AiProposalsOverlay'
import PendingUpdatesLayer from '@/map/feature_updates/PendingUpdatesLayer'
import ReadOnlyNotice from '@/map/panels/ReadOnlyNotice'
import HelpAction from '@/map/panels/HelpAction'
import { FeedbackButton } from '@/components/feedback/FeedbackButton'
import ShortcutsSheet, { ShortcutsButton } from '@/map/shortcuts/ShortcutsSheet'
import VariantPicker from '@/map/variants/VariantPicker'
import TimeStrip from '@/map/time/TimeStrip'
import ShadeOverlay from '@/map/time/ShadeOverlay'
import HarvestsOverlay from '@/map/harvests/HarvestsOverlay'
import PlantsOverlay from '@/map/plants/PlantsOverlay'
import SelectionOverlay from '@/map/selection/SelectionOverlay'
import PlantPeekOverlay from '@/map/plants/PlantPeekOverlay'
import { isPatch, isPlant } from '@/map/plants/properties'
import SectorsOverlay from '@/map/sectors/SectorsOverlay'
import PhotosOverlay from '@/map/photos/PhotosOverlay'
import SoilOverlay from '@/map/soil/SoilOverlay'
import WeatherStationsOverlay from '@/map/weather_stations/WeatherStationsOverlay'
import WeatherNowOverlay from '@/map/weather_now/WeatherNowOverlay'
import GpsAccuracyOverlay from '@/map/gps/GpsAccuracyOverlay'
import DrawingLayers from '@/map/drawing/DrawingLayers'
import LabelPeek from '@/map/drawing/LabelPeek'
import ReliefWorksSync from '@/map/data/ReliefWorksSync'
import DrawingToolbar from '@/map/drawing/DrawingToolbar'
import ExportMenu from '@/map/drawing/ExportMenu'
import LiveSync from '@/map/drawing/LiveSync'
import AerialViewsOverlay from '@/drone/AerialViewsOverlay'
import TransferNotice from '@/transfer/TransferNotice'
import PlanImagesOverlay from '@/map/plan_images/PlanImagesOverlay'
import EarthworksOverlay from '@/map/earthworks/EarthworksOverlay'
import PresentationOverlay from '@/map/presentation/PresentationOverlay'
import DrawnViewOverlay from '@/map/drawn/DrawnViewOverlay'
import PlaceMarginOverlay from '@/map/drawn/PlaceMarginOverlay'
import PhaseOverlay from '@/map/phases/PhaseOverlay'
import MapOpeningProbe from '@/map/performance/MapOpeningProbe'
import { appliesToFunctions } from '@/map/functions/store'

// Register editor panels here (one line per panel, keep groups together).
export const PANELS: EditorPanel[] = [
  { id: 'journey', label: 'journey.panel.title', icon: Route, group: 'observe', component: deferred(() => import('@/map/panels/JourneyPanel')), order: 1, hiddenFromRail: true },
  // 1. Observer
  { id: 'project', label: 'journey.project.title', icon: ClipboardList, group: 'observe', component: deferred(() => import('@/map/panels/ProjectPanel')), order: 5, modal: true, essential: true },
  { id: 'layers', label: 'map_data.panels.layers', icon: MapIcon, group: 'observe', component: deferred(() => import('@/map/panels/LayersPanel')), order: 10, essential: true },
  { id: 'relief', label: 'relief.panel', icon: Mountain, group: 'observe', component: deferred(() => import('@/map/panels/ReliefPanel')), order: 30, essential: true },
  { id: 'sun', label: 'sun.panel_title', icon: Sun, group: 'observe', component: deferred(() => import('@/map/sun/SunPanel')), order: 35, essential: true },
  { id: 'sectors', label: 'sectors.panel_title', icon: Compass, group: 'observe', component: deferred(() => import('@/map/sectors/SectorsPanel')), order: 37 },
  { id: 'climate', label: 'climate.panel_title', icon: CloudSun, group: 'observe', component: deferred(() => import('@/map/panels/ClimatePanel')), order: 40 },
  { id: 'site-rules', label: 'site_rules.panel_title', icon: ShieldAlert, group: 'observe', component: deferred(() => import('@/map/site_rules/SiteRulesPanel')), order: 50 },
  { id: 'soil', label: 'soil.panel_label', icon: FlaskConical, group: 'observe', component: deferred(() => import('@/map/soil/SoilPanel')), order: 60 },
  { id: 'canopy', label: 'canopy.panel_title', icon: Trees, group: 'observe', component: deferred(() => import('@/map/canopy/CanopyPanel')), order: 65 },
  { id: 'photos', label: 'soil_photos.panel_label', icon: Camera, group: 'observe', component: deferred(() => import('@/map/photos/PhotosPanel')), order: 70, essential: true },
  { id: 'documents', label: 'documents.title', icon: Files, group: 'observe', component: deferred(() => import('@/map/documents/DocumentsPanel')), order: 75 },
  // 2. Cartographier
  { id: 'terrain', label: 'editor.panels.terrain', icon: MapPinned, group: 'map', component: deferred(() => import('@/map/panels/TerrainPanel')), order: 10, essential: true },
  { id: 'plan-images', label: 'plan_images.panel_title', icon: FileImage, group: 'map', component: deferred(() => import('@/map/plan_images/PlanImagesPanel')), order: 20 },
  { id: 'elements', label: 'editor.panels.elements', icon: Layers3, group: 'map', component: deferred(() => import('@/map/panels/ElementsPanel')), order: 30, essential: true },
  { id: 'drawing-layers', label: 'drawing.panels.layers', icon: Eye, group: 'map', component: deferred(() => import('@/map/drawing/LayersPanel')), order: 40 },
  // 3. Concevoir
  { id: 'zones', label: 'permaculture_zones.panel_title', icon: Target, group: 'design', component: deferred(() => import('@/map/zones/ZonesPanel')), order: 10, essential: true },
  { id: 'palette', label: 'editor.panels.palette', icon: Sprout, group: 'design', component: deferred(() => import('@/map/plants/PalettePanel')), order: 20, essential: true },
  { id: 'water-sources', label: 'water_sources.panel_title', icon: Droplets, group: 'design', component: deferred(() => import('@/map/water/WaterSourcesPanel')), order: 50, essential: true },
  { id: 'design-phases', label: 'design_phases.panel_title', icon: Archive, group: 'design', component: deferred(() => import('@/map/phases/DesignPhasesPanel')), order: 51 },
  { id: 'variants', label: 'variants.panel_title', icon: GitBranch, group: 'design', component: deferred(() => import('@/map/variants/VariantsPanel')), order: 52 },
  { id: 'earthworks', label: 'earthworks.panel_title', icon: Shovel, group: 'design', component: deferred(() => import('@/map/earthworks/EarthworksPanel')), order: 55 },
  { id: 'functions', label: 'element_functions.panel_title', icon: Waypoints, group: 'design', component: deferred(() => import('@/map/functions/FunctionsPanel')), order: 60 },
  { id: 'drawing-alerts', label: 'drawing.panels.alerts', icon: TriangleAlert, group: 'design', component: deferred(() => import('@/map/drawing/AlertsPanel')), order: 70 },
  // 4. Planter
  { id: 'plant-list', label: 'editor.panels.plant_list', icon: ListChecks, group: 'plant', component: deferred(() => import('@/map/plants/PlantListPanel')), order: 10, essential: true },
  { id: 'harvests', label: 'plant_harvests.panel_title', icon: Apple, group: 'plant', component: deferred(() => import('@/map/harvests/HarvestsPanel')), order: 15 },
  { id: 'finances', label: 'finances.panel_title', icon: PiggyBank, group: 'plant', component: deferred(() => import('@/map/panels/FinancesPanel')), order: 20 },
  { id: 'actions', label: 'journey.requests.panel_title', icon: Handshake, group: 'plant', component: deferred(() => import('@/map/panels/ActionsPanel')), order: 30 },
  // Échanger (no number)
  { id: 'discussions', label: 'collab.panels.discussions', icon: DiscussionsIcon, group: 'share', component: deferred(() => import('@/collab/DiscussionsPanel')), order: 10, essential: true },
  { id: 'offer', label: 'offers.panel.title', icon: Receipt, group: 'share', component: deferred(() => import('@/map/panels/OfferPanel')), requires: 'offers', order: 15 },
  { id: 'present', label: 'presentations.panel_title', icon: Presentation, group: 'share', component: deferred(() => import('@/map/presentation/PresentationPanel')), order: 17, essential: true },
  { id: 'publish', label: 'collab.panels.publish', icon: Globe, group: 'share', component: deferred(() => import('@/collab/PublishPanel')), requires: 'owner', order: 20, essential: true },
  { id: 'ai-journal', label: 'ai_journal.title', icon: Bot, group: 'share', component: deferred(() => import('@/map/panels/AiJournalPanel')), requires: 'owner', order: 80 },
]

// Register inspector sections for a selected feature here.
export const INSPECTOR_SECTIONS: InspectorSection[] = [
  { id: 'discussion', applies: () => true, component: deferred(() => import('@/collab/DiscussionSection'), 'none'), order: 90 },
  { id: 'draft-review', applies: (f) => f.properties.status === 'draft', component: deferred(() => import('@/map/drafts/DraftReviewSection'), 'none'), order: 5 },
  { id: 'update-review', applies: (f) => f.properties.status === 'active', component: deferred(() => import('@/map/feature_updates/UpdateReviewSection'), 'none'), order: 6 },
  { id: 'plant', applies: isPlant, component: deferred(() => import('@/map/plants/PlantSection'), 'none'), order: 20, placement: 'fold' },
  { id: 'plant-observations', applies: isPlant, component: deferred(() => import('@/map/plants/ObservationsSection'), 'none'), order: 2, placement: 'top' },
  { id: 'plant-harvests', applies: isPlant, component: deferred(() => import('@/map/harvests/HarvestsSection'), 'none'), order: 20.5 },
  { id: 'fruit-store', applies: appliesToFruitStore, component: deferred(() => import('@/map/storage/StorageSection'), 'none'), order: 20.5 },
  { id: 'plant-wind-shelter', applies: isPlant, component: deferred(() => import('@/map/plants/WindShelterSection'), 'none'), order: 21.5 },
  { id: 'plant-identify', applies: isPlant, component: deferred(() => import('@/map/plants/IdentifySection'), 'none'), order: 22 },
  { id: 'plant-other-properties', applies: isPlant, component: deferred(() => import('@/map/plants/OtherPropertiesSection'), 'none'), order: 23, placement: 'fold' },
  { id: 'feature-tasks', applies: (f) => f.properties.status === 'active' && !isAnnotationLayer(f.properties.layer), component: deferred(() => import('@/map/tasks/FeatureTasksSection'), 'none'), order: 21.5 },
  { id: 'patch', applies: isPatch, component: deferred(() => import('@/map/plants/PatchSection'), 'none'), order: 20 },
  { id: 'photos', applies: (f) => !isPlant(f), component: deferred(() => import('@/map/photos/PhotosInspector'), 'none'), order: 70 },
  { id: 'plant-photos', applies: isPlant, component: deferred(() => import('@/map/plants/PlantPhotosSection'), 'none'), order: 1, placement: 'top' },
  { id: 'sector', applies: isSector, component: deferred(() => import('@/map/sectors/SectorInspector'), 'none'), order: 20 },
  { id: 'permaculture-zone', applies: appliesToZone, component: deferred(() => import('@/map/zones/ZoneSection'), 'none'), order: 17 },
  { id: 'drawing-element', applies: appliesToElement, component: deferred(() => import('@/map/drawing/ElementSection'), 'none'), order: 20 },
  { id: 'water-source', applies: appliesToWaterSource, component: deferred(() => import('@/map/water/WaterSourceSection'), 'none'), order: 19 },
  { id: 'tree-height', applies: (f) => f.properties.kind === 'existing_tree' && f.properties.status === 'active', component: deferred(() => import('@/map/drawing/TreeHeightSection'), 'none'), order: 20.2 },
  { id: 'gps-accuracy', applies: appliesToGpsPoint, component: deferred(() => import('@/map/gps/GpsAccuracySection'), 'none'), order: 10 },
  { id: 'tags', applies: () => true, component: deferred(() => import('@/map/tags/TagsSection'), 'none'), order: 15 },
  { id: 'project-state', applies: appliesToProjectState, component: deferred(() => import('@/map/drawing/ProjectStateSection'), 'none'), order: 16 },
  { id: 'variant', applies: appliesToVariant, component: deferred(() => import('@/map/variants/VariantSection'), 'none'), order: 16.5 },
  { id: 'implementation-phase', applies: appliesToPhase, component: deferred(() => import('@/map/implementation/PhaseSection'), 'none'), order: 17 },
  { id: 'earthworks', applies: appliesToEarthworks, component: deferred(() => import('@/map/earthworks/EarthworksSection'), 'none'), order: 25 },
  { id: 'catchment', applies: appliesToCatchment, component: deferred(() => import('@/map/water/CatchmentSection'), 'none'), order: 24 },
  { id: 'water-links', applies: appliesToLinks, component: deferred(() => import('@/map/water/LinksSection'), 'none'), order: 23.5 },
  { id: 'infiltration', applies: appliesToInfiltration, component: deferred(() => import('@/map/water/InfiltrationSection'), 'none'), order: 18 },
  { id: 'keyline', applies: appliesToKeyline, component: deferred(() => import('@/map/water/KeylineSection'), 'none'), order: 23 },
  { id: 'storm', applies: appliesToStorm, component: deferred(() => import('@/map/water/StormSection'), 'none'), order: 18 },
  { id: 'functions', applies: appliesToFunctions, component: deferred(() => import('@/map/functions/FunctionsSection'), 'none'), order: 26 },
]

// Top bar actions (right side), e.g. share, export.
export const HEADER_ACTIONS: EditorSlot[] = [
  { id: 'share', component: ShareButton, order: 80 },
  { id: 'chat', component: ChatToggle, order: 79 },
  { id: 'read-only-notice', component: ReadOnlyNotice, order: 5 },
  { id: 'help', component: HelpAction, order: 95 },
  { id: 'shortcuts', component: ShortcutsButton, order: 94 },
  { id: 'feedback', component: FeedbackButton, order: 93 },
  { id: 'notifications', component: EditorNotificationBell, order: 96 },
  { id: 'drawing-export', component: ExportMenu, order: 60 },
  { id: 'transfer-notice', component: TransferNotice, order: 4 },
]

// Overlays over the map, e.g. drawing toolbar, identify popup, drafts review bar.
export const OVERLAYS: EditorSlot[] = [
  { id: 'collab', component: CollabOverlay, order: 90 },
  { id: 'chat', component: MapChat, order: 91 },
  { id: 'welcome', component: WelcomeCard, order: 92 },
  { id: 'journey-chip', component: JourneyOverlay, order: 20 },
  { id: 'variant', component: VariantPicker, order: 25 },
  { id: 'time-strip', component: TimeStrip, order: 24 },
  { id: 'time-shade', component: ShadeOverlay, order: 19 },
  { id: 'tour', component: TourOverlay, order: 100 },
  { id: 'first-hour', component: FirstHourOverlay, order: 99 },
  { id: 'shortcuts', component: ShortcutsSheet, order: 101 },
  { id: 'region-layers', component: RegionLayersOverlay, order: 0 },
  { id: 'photo-limit', component: PhotoLimitOverlay, order: 6 },
  { id: 'layer-legend', component: LegendOverlay, order: 5 },
  { id: 'identify', component: IdentifyOverlay, order: 40 },
  { id: 'ai-proposals', component: AiProposalsOverlay, order: 40 },
  { id: 'pending-updates', component: PendingUpdatesLayer, order: 41 },
  { id: 'plants', component: PlantsOverlay, order: 20 },
  { id: 'plant-peek', component: PlantPeekOverlay, order: 42 },
  { id: 'selection', component: SelectionOverlay, order: 43 },
  { id: 'photos', component: PhotosOverlay, order: 70 },
  { id: 'soil', component: SoilOverlay, order: 60 },
  { id: 'weather-stations', component: WeatherStationsOverlay, order: 61 },
  { id: 'weather-now', component: WeatherNowOverlay, order: 62 },
  { id: 'canopy', component: CanopyOverlay, order: 3 },
  { id: 'harvests', component: HarvestsOverlay, order: 21 },
  { id: 'drawing-layers', component: DrawingLayers, order: 10 },
  { id: 'label-peek', component: LabelPeek, order: 43 },
  { id: 'relief-works', component: ReliefWorksSync, order: 44 },
  { id: 'drawing-toolbar', component: DrawingToolbar, order: 40 },
  { id: 'drawing-live', component: LiveSync, order: 90 },
  { id: 'aerial-views', component: AerialViewsOverlay, order: 1 },
  { id: 'plan-images', component: PlanImagesOverlay, order: 2 },
  { id: 'gps-accuracy', component: GpsAccuracyOverlay, order: 15 },
  { id: 'earthworks', component: EarthworksOverlay, order: 12 },
  { id: 'sectors', component: SectorsOverlay, order: 13 },
  { id: 'presentation', component: PresentationOverlay, order: 95 },
  { id: 'drawn-view', component: DrawnViewOverlay, order: 96 },
  { id: 'design-phase', component: PhaseOverlay, order: 98 },
  { id: 'place-margin', component: PlaceMarginOverlay, order: 97 },
  { id: 'opening-probe', component: MapOpeningProbe, order: 200 },
]
