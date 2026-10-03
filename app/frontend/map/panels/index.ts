import { Layers3, MapPinned } from 'lucide-react'
import type { EditorPanel, EditorSlot, InspectorSection } from '@/map/panels/registry'
import TerrainPanel from '@/map/panels/TerrainPanel'
import ElementsPanel from '@/map/panels/ElementsPanel'
import { Globe } from 'lucide-react'
import CollabOverlay from '@/collab/CollabOverlay'
import DiscussionSection from '@/collab/DiscussionSection'
import DiscussionsPanel from '@/collab/DiscussionsPanel'
import { DiscussionsIcon } from '@/collab/DiscussionsIcon'
import PublishPanel from '@/collab/PublishPanel'
import ShareButton from '@/collab/ShareButton'

// Register editor panels here (one line per panel, keep groups together).
export const PANELS: EditorPanel[] = [
  { id: 'terrain', label: 'editor.panels.terrain', icon: MapPinned, group: 'map', component: TerrainPanel, order: 10 },
  { id: 'elements', label: 'editor.panels.elements', icon: Layers3, group: 'design', component: ElementsPanel, order: 90 },
  { id: 'discussions', label: 'collab.panels.discussions', icon: DiscussionsIcon, group: 'share', component: DiscussionsPanel, order: 10 },
  { id: 'publish', label: 'collab.panels.publish', icon: Globe, group: 'share', component: PublishPanel, requires: 'owner', order: 20 },
]

// Register inspector sections for a selected feature here.
export const INSPECTOR_SECTIONS: InspectorSection[] = [
  { id: 'discussion', applies: () => true, component: DiscussionSection, order: 90 },
]

// Top bar actions (right side), e.g. share, export.
export const HEADER_ACTIONS: EditorSlot[] = [
  { id: 'share', component: ShareButton, order: 80 },
]

// Overlays over the map, e.g. drawing toolbar, identify popup, drafts review bar.
export const OVERLAYS: EditorSlot[] = [
  { id: 'collab', component: CollabOverlay, order: 90 },
]
