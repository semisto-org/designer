import { useEditor } from '@/map/editor/EditorContext'
import { ZoneCard } from '@/map/layout/ZoneLayer'
import { PRIORITY } from '@/map/layout/zones'
import DraftsBar from '@/map/drafts/DraftsBar'
import FeatureUpdatesBar from '@/map/feature_updates/FeatureUpdatesBar'
import { useFeatureUpdates } from '@/map/feature_updates/store'

/**
 * In the messages under the toolbar, what an AI proposed and waits for a
 * person: new elements (drafts) and changes to existing ones, one card each,
 * stacked so they never cover each other. An action in progress (drawing,
 * placing) goes first; on a phone it waits behind it (map/layout/zones).
 */
export default function AiProposalsOverlay() {
  const editor = useEditor()
  const { updates } = useFeatureUpdates()
  const waiting = updates.length > 0 || editor.features.some((f) => f.properties.status === 'draft')
  return (
    <ZoneCard id="ai-proposals" zone="top" priority={PRIORITY.aiProposals} active={waiting} passThrough className="w-full max-w-md items-stretch gap-2">
      <DraftsBar />
      <FeatureUpdatesBar />
    </ZoneCard>
  )
}
