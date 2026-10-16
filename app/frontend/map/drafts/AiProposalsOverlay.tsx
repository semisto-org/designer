import clsx from 'clsx'
import { useEditor } from '@/map/editor/EditorContext'
import DraftsBar from '@/map/drafts/DraftsBar'
import FeatureUpdatesBar from '@/map/feature_updates/FeatureUpdatesBar'

/**
 * Under the drawing toolbar, what an AI proposed and waits for a person:
 * new elements (drafts) and changes to existing ones, one card each,
 * stacked so they never cover each other.
 */
export default function AiProposalsOverlay() {
  const editor = useEditor()
  const panelOpen = editor.activePanel != null
  const inspectorOpen = editor.selected != null
  return (
    <div
      className={clsx(
        'pointer-events-none absolute top-14 z-20 flex flex-col items-center gap-2 md:items-start',
        // Clear of an open panel (left, from md up) and the zoom controls (right).
        'left-2 right-12',
        panelOpen ? 'md:left-[21.5rem]' : 'md:left-4',
        inspectorOpen ? 'md:right-[21.5rem]' : 'md:right-14',
      )}
    >
      <DraftsBar />
      <FeatureUpdatesBar />
    </div>
  )
}
