import type { LucideIcon } from 'lucide-react'
import { MessagesSquare } from 'lucide-react'
import { useEditor } from '@/map/editor/EditorContext'
import { useThreads } from './threadsStore'

/** The panel rail icon, with a dot while some discussion has unread comments. */
function Icon({ className }: { className?: string }) {
  const editor = useEditor()
  const { threads } = useThreads(editor.map.id)
  const unread = threads.some((thread) => thread.unread)
  return (
    <span className="relative inline-flex">
      <MessagesSquare className={className} />
      {unread && <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-prune-600 ring-2 ring-white" />}
    </span>
  )
}

export const DiscussionsIcon = Icon as unknown as LucideIcon
