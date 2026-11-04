import { Link, router } from '@inertiajs/react'
import { AtSign, Bell, BellOff, Settings2 } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { toast } from '@/components/ui/toast'
import { api } from '@/lib/api'
import { cable } from '@/lib/cable'
import { t } from '@/lib/i18n'
import { relativeTime } from '@/lib/relativeTime'

export type InboxItem = {
  mapId: number
  mapName: string
  unread: number
  mentions: number
  lastAt: string
  last: { author: string; avatarUrl: string | null; body: string }
  url: string
}
type Inbox = { items: InboxItem[]; total: number; enabled: boolean }

/**
 * The bell in the header (Michael, 2026-11-04): what was said in the
 * discussions of all my maps while I was elsewhere, newest first, each map
 * counted by my level on it. It rings live (NotificationsChannel): the count
 * moves and a short toast says who wrote where, unless that map's discussion
 * is the one in front of me. Turned off in « Mon compte », it still lists
 * the messages but stays quiet.
 *
 * In the map editor, `currentMapId` is the map open: its discussion has its
 * own button, so its messages do not toast, and its line opens the dock.
 */
export function NotificationBell({ currentMapId, onOpenCurrent }: { currentMapId?: number; onOpenCurrent?: () => void }) {
  const [inbox, setInbox] = useState<Inbox | null>(null)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const current = useRef(currentMapId)
  current.current = currentMapId

  const load = useCallback(async () => {
    try {
      const data = await api<Inbox>('/notifications')
      setInbox(data)
      return data
    } catch {
      return null
    }
  }, [])

  useEffect(() => {
    void load()
    // Back on the tab: what was read elsewhere (the phone) is no longer new.
    const onVisible = () => { if (document.visibilityState === 'visible') void load() }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [load])

  // Live: told that a message reached me on one of my maps.
  useEffect(() => {
    const subscription = cable().subscriptions.create({ channel: 'NotificationsChannel' }, {
      received: (event: { type: string; mapId: number }) => {
        if (event.type !== 'chat') return
        void load().then((data) => {
          if (!data?.enabled || event.mapId === current.current) return
          const item = data.items.find((entry) => entry.mapId === event.mapId)
          if (!item) return
          toast(t('notifications.toast', { author: item.last.author, map: item.mapName, body: item.last.body }), {
            action: { label: t('notifications.open'), run: () => router.visit(item.url) },
          })
        })
      },
    })
    return () => { subscription.unsubscribe() }
  }, [load])

  useEffect(() => {
    if (!open) return
    void load()
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === 'Escape' : !ref.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', close)
    }
  }, [open, load])

  async function readAll() {
    try {
      setInbox(await api<Inbox>('/notifications/read_all', { method: 'POST' }))
    } catch {
      toast(t('notifications.preferences.error'), { tone: 'error' })
    }
  }

  const total = inbox?.total ?? 0
  const label = total > 0 ? t('notifications.bell_unread', { count: total }) : t('notifications.bell')
  return (
    <div ref={ref} className="relative" data-private>
      <IconButton label={label} pressed={open} onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-haspopup="dialog" className="relative">
        {inbox && !inbox.enabled ? <BellOff /> : <Bell />}
        {total > 0 && (
          <span aria-hidden className="absolute -right-0.5 -top-0.5 inline-flex min-w-5 items-center justify-center rounded-full bg-humus-500 px-1 text-sm font-semibold leading-5 text-white ring-2 ring-white">
            {total > 99 ? '99+' : total}
          </span>
        )}
      </IconButton>

      {open && (
        <div role="dialog" aria-label={t('notifications.bell')} className="fixed inset-x-4 top-16 z-50 rounded-2xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-[22rem] bg-white p-2 shadow-lg ring-1 ring-loam-200">
          <div className="flex items-center justify-between gap-2 px-3 pb-1 pt-2">
            <p className="whitespace-nowrap font-hand text-lg text-leaf-600">{t('notifications.title')}</p>
            {(inbox?.items.length ?? 0) > 0 && (
              <Button size="sm" variant="ghost" className="whitespace-nowrap" onClick={() => void readAll()}>{t('notifications.read_all')}</Button>
            )}
          </div>
          {inbox && !inbox.enabled && <p className="px-3 pb-2 text-sm text-humus-800">{t('notifications.off')}</p>}
          {inbox && inbox.items.length === 0 && (
            <div className="space-y-1 px-3 pb-3 pt-1 text-sm">
              <p className="text-loam-700">{t('notifications.empty')}</p>
              <p className="text-loam-500">{t('notifications.empty_hint')}</p>
            </div>
          )}
          <ul className="max-h-[60vh] space-y-1 overflow-y-auto">
            {inbox?.items.map((item) => (
              <li key={item.mapId}>
                <Link
                  href={item.url}
                  onClick={(event) => {
                    setOpen(false)
                    if (item.mapId === currentMapId && onOpenCurrent) {
                      event.preventDefault()
                      onOpenCurrent()
                    }
                  }}
                  className="flex gap-3 rounded-xl px-3 py-2 hover:bg-prune-50"
                >
                  <Avatar name={item.last.author} url={item.last.avatarUrl} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate font-serif text-base text-loam-900">{item.mapName}</span>
                      <span className="shrink-0 text-sm text-loam-400">{relativeTime(item.lastAt)}</span>
                    </span>
                    <span className="line-clamp-2 text-sm text-loam-600">
                      <span className="font-medium text-loam-800">{item.last.author}</span> : {item.last.body}
                    </span>
                    <span className="mt-1 flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-medium text-humus-700">{t('notifications.unread', { count: item.unread })}</span>
                      {item.mentions > 0 && (
                        <span className="inline-flex items-center gap-1 text-prune-700"><AtSign className="h-3.5 w-3.5" aria-hidden />{t('notifications.mention')}</span>
                      )}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-1 border-t border-dashed border-loam-200 pt-1">
            <Link href="/account#notifications" onClick={() => setOpen(false)} className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-loam-600 hover:bg-prune-50 hover:text-prune-800">
              <Settings2 className="h-4 w-4 text-loam-400" aria-hidden />
              {t('notifications.settings')}
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}

function Avatar({ name, url }: { name: string; url: string | null }) {
  return url ? (
    <img src={url} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" referrerPolicy="no-referrer" />
  ) : (
    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-prune-100 text-sm font-semibold text-prune-700">{name.slice(0, 1).toUpperCase()}</span>
  )
}
