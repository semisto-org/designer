import { usePage } from '@inertiajs/react'
import { NotificationBell } from '@/components/notifications/NotificationBell'
import { useEditor } from '@/map/editor/EditorContext'
import type { SharedProps } from '@/types'
import { chatActions } from './chatStore'

/** The header's bell inside the map editor: this map's line opens its discussion in place. */
export default function EditorNotificationBell() {
  const editor = useEditor()
  const signedIn = (usePage().props as unknown as SharedProps).currentUser != null
  if (!signedIn) return null
  return <NotificationBell currentMapId={editor.map.id} onOpenCurrent={() => chatActions.setOpen(true)} />
}
