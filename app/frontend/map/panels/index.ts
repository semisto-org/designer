import { Bot, Layers3, MapPinned } from 'lucide-react'
import type { EditorPanel, EditorSlot, InspectorSection } from '@/map/panels/registry'
import TerrainPanel from '@/map/panels/TerrainPanel'
import ElementsPanel from '@/map/panels/ElementsPanel'
import AiJournalPanel from '@/map/panels/AiJournalPanel'
import DraftsBar from '@/map/drafts/DraftsBar'
import DraftReviewSection from '@/map/drafts/DraftReviewSection'

// Register editor panels here (one line per panel, keep groups together).
export const PANELS: EditorPanel[] = [
  { id: 'terrain', label: 'editor.panels.terrain', icon: MapPinned, group: 'map', component: TerrainPanel, order: 10 },
  { id: 'elements', label: 'editor.panels.elements', icon: Layers3, group: 'design', component: ElementsPanel, order: 90 },
  { id: 'ai-journal', label: 'ai_journal.title', icon: Bot, group: 'share', component: AiJournalPanel, requires: 'owner', order: 80 },
]

// Register inspector sections for a selected feature here.
export const INSPECTOR_SECTIONS: InspectorSection[] = [
  { id: 'draft-review', applies: (f) => f.properties.status === 'draft', component: DraftReviewSection, order: 5 },
]

// Top bar actions (right side), e.g. share, export.
export const HEADER_ACTIONS: EditorSlot[] = []

// Overlays over the map, e.g. drawing toolbar, identify popup, drafts review bar.
export const OVERLAYS: EditorSlot[] = [
  { id: 'drafts-bar', component: DraftsBar, order: 40 },
]
