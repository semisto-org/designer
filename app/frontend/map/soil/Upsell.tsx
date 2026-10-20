import { PlanGate } from '@/components/billing/PlanGate'
import { useEditor } from '@/map/editor/EditorContext'

/**
 * Shown where the reading of results would be, when the map owner's plan has
 * no analyses. Never blocks the data: figures stay entered and visible.
 */
export default function Upsell() {
  const editor = useEditor()
  return <PlanGate feature="soil" place={editor.map} canUpgrade={editor.isOwner} panel="soil" />
}
