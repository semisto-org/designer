import { Link } from '@inertiajs/react'
import { AtSign, Bell, BellOff, Check } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { t } from '@/lib/i18n'
import type { ChatLevel } from '@/types/collab'

const LEVELS: { level: ChatLevel; icon: typeof Bell }[] = [
  { level: 'all', icon: Bell },
  { level: 'mentions', icon: AtSign },
  { level: 'none', icon: BellOff },
]

/**
 * The bell of a map's discussion: how much of it reaches me, on this map
 * only (every message, only my mentions, nothing). Where it reaches me (the
 * header's bell, e-mail, the phone) is set once for all maps in « Mon compte ».
 */
export function ChatNotifyMenu({ level, onChange }: { level: ChatLevel; onChange: (level: ChatLevel) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === 'Escape' : !ref.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', close)
    }
  }, [open])

  const Icon = LEVELS.find((entry) => entry.level === level)?.icon ?? Bell
  return (
    <div ref={ref} className="relative">
      <IconButton size="sm" label={`${t('collab.chat.notify.label')} : ${t(`collab.chat.notify.${level}`)}`} pressed={open || level !== 'all'} aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen((value) => !value)}>
        <Icon />
      </IconButton>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-30 mt-2 w-72 rounded-2xl bg-white p-2 shadow-lg ring-1 ring-loam-200">
          <p className="px-3 pb-1 pt-2 font-hand text-lg text-leaf-600">{t('collab.chat.notify.label')}</p>
          {LEVELS.map(({ level: value, icon: ItemIcon }) => (
            <Button
              key={value}
              role="menuitemradio"
              aria-checked={value === level}
              variant="ghost"
              size="sm"
              className="h-auto w-full justify-start gap-3 rounded-xl px-3 py-2 text-left"
              onClick={() => {
                setOpen(false)
                if (value !== level) onChange(value)
              }}
            >
              <ItemIcon className="h-4 w-4 shrink-0" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block font-medium text-loam-900">{t(`collab.chat.notify.${value}`)}</span>
                <span className="block font-normal text-loam-500">{t(`collab.chat.notify.${value}_hint`)}</span>
              </span>
              {value === level && <Check className="h-4 w-4 shrink-0 text-leaf-600" aria-hidden />}
            </Button>
          ))}
          <div className="mt-1 border-t border-dashed border-loam-200 pt-1">
            <Link href="/account#notifications" className="block rounded-lg px-3 py-2 text-sm text-loam-600 hover:bg-prune-50 hover:text-prune-800">
              {t('collab.chat.notify.settings_link')}
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
