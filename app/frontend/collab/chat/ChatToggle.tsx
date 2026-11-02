import { MessageCircle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { RevealLabel } from '@/components/ui/RevealLabel'
import { t } from '@/lib/i18n'
import { useEditor } from '@/map/editor/EditorContext'
import { chatActions, useChat } from './chatStore'

/** Header action « Discussion »: shows or hides the map's discussion (key D), with what arrived meanwhile. */
export default function ChatToggle() {
  const editor = useEditor()
  const chat = useChat()
  if (!editor.map.chat) return null
  const label = chat.open ? t('collab.chat.hide') : t('collab.chat.open')
  const unread = !chat.open && chat.unread !== 0
  return (
    <Button
      size="sm"
      variant={chat.open ? 'primary' : 'secondary'}
      className="group relative gap-x-0 pl-2 pr-2"
      aria-label={unread && chat.unread > 0 ? `${label} · ${t('collab.chat.unread', { count: chat.unread })}` : label}
      aria-pressed={chat.open}
      title={`${label} (D)`}
      onClick={() => chatActions.toggle()}
    >
      <MessageCircle className="h-4 w-4" />
      <RevealLabel>{t('collab.chat.toggle')}</RevealLabel>
      {unread && (
        <span className="absolute -right-1.5 -top-1.5 inline-flex min-w-5 items-center justify-center rounded-full bg-humus-500 px-1 text-sm font-semibold leading-5 text-white ring-2 ring-white">
          {chat.unread > 0 ? chat.unread : ''}
        </span>
      )}
    </Button>
  )
}
