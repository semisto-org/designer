import { MessageSquare } from 'lucide-react'
import { t } from '@/lib/i18n'
import { useEditor } from '@/map/editor/EditorContext'
import type { MapFeature } from '@/types'
import { CommentThread } from './CommentThread'
import { useThreads } from './threadsStore'

/** Inspector section: the discussion of the selected element, for anyone with access. */
export default function DiscussionSection({ feature }: { feature: MapFeature }) {
  const editor = useEditor()
  const id = feature.properties.id
  const { threads } = useThreads(editor.map.id)
  const count = threads.find((thread) => thread.key === `MapFeature:${id}`)?.count ?? 0
  return (
    <section aria-labelledby="discussion-title" className="border-t border-loam-100 pt-3">
      <h3 id="discussion-title" className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-loam-500">
        <MessageSquare className="h-3.5 w-3.5" />
        {t('collab.discussion.title')}
        {count > 0 && <span className="rounded-full bg-prune-100 px-1.5 text-[11px] normal-case tracking-normal text-prune-700">{count}</span>}
      </h3>
      <CommentThread key={id} type="MapFeature" id={id} />
    </section>
  )
}
