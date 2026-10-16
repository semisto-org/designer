import { Link, router, usePage } from '@inertiajs/react'
import { Check, LogOut, Plus, UserRound } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { t } from '@/lib/i18n'
import type { CurrentUser, SharedProps } from '@/types'

/**
 * The avatar in the header opens the account menu: « Mon compte », the other
 * accounts signed in on this browser (« Changer de compte »: a freelance
 * designer and their @semisto.org address), adding one, signing out.
 */
export function AccountMenu({ user }: { user: CurrentUser }) {
  const { otherAccounts = [], impersonation } = usePage().props as unknown as SharedProps
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

  const item = 'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-loam-700 hover:bg-prune-50 hover:text-prune-800'

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-2 rounded-full py-0.5 pl-0.5 pr-1 text-loam-600 hover:text-loam-900 sm:pr-2"
      >
        <Avatar name={user.name} url={user.avatarUrl} />
        <span className="hidden sm:inline">{user.name}</span>
        {otherAccounts.length > 0 && (
          <span className="grid h-6 min-w-6 place-items-center rounded-full bg-leaf-100 px-1.5 text-sm font-semibold text-leaf-700" title={t('account_switch.count', { count: otherAccounts.length + 1 })}>
            {otherAccounts.length + 1}
          </span>
        )}
      </button>

      {open && (
        <div role="menu" className="absolute right-0 top-full z-50 mt-2 w-72 rounded-2xl bg-white p-2 shadow-lg ring-1 ring-loam-200">
          <div className="flex items-center gap-3 rounded-lg px-3 py-2">
            <Avatar name={user.name} url={user.avatarUrl} size="lg" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-loam-900">{user.name}</p>
              <p className="truncate text-sm text-loam-500">{user.email}</p>
            </div>
            <Check className="h-4 w-4 shrink-0 text-leaf-600" aria-label={t('account_switch.current')} />
          </div>
          <Link href="/account" className={item} onClick={() => setOpen(false)}>
            <UserRound className="h-4 w-4 text-loam-400" aria-hidden="true" />
            {t('account.title')}
          </Link>

          {!impersonation && (
            <div className="mt-1 border-t border-dashed border-loam-200 pt-1">
              {otherAccounts.length > 0 && <p className="px-3 pb-1 pt-2 font-hand text-lg text-leaf-600">{t('account_switch.title')}</p>}
              {otherAccounts.map((account) => (
                <button
                  key={account.sessionId}
                  type="button"
                  role="menuitem"
                  className={item}
                  onClick={() => router.post(`/session/switch/${account.sessionId}`)}
                >
                  <Avatar name={account.name} url={account.avatarUrl} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-loam-900">{account.name}</span>
                    <span className="block truncate text-loam-500">{account.email}</span>
                  </span>
                </button>
              ))}
              <Link href="/session/new?add=1" className={item} onClick={() => setOpen(false)}>
                <span className="grid h-7 w-7 place-items-center rounded-full border border-dashed border-loam-300 text-loam-500"><Plus className="h-4 w-4" aria-hidden="true" /></span>
                {t('account_switch.add')}
              </Link>
            </div>
          )}

          <div className="mt-1 border-t border-dashed border-loam-200 pt-1">
            <Link href="/session" method="delete" as="button" className={item}>
              <LogOut className="h-4 w-4 text-loam-400" aria-hidden="true" />
              {otherAccounts.length > 0 ? t('account_switch.sign_out_this', { email: user.email }) : t('nav.sign_out')}
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}

function Avatar({ name, url, size = 'md' }: { name: string; url: string | null; size?: 'md' | 'lg' }) {
  const box = size === 'lg' ? 'h-9 w-9' : 'h-7 w-7'
  return url ? (
    <img src={url} alt="" className={`${box} shrink-0 rounded-full object-cover`} referrerPolicy="no-referrer" />
  ) : (
    <span className={`${box} grid shrink-0 place-items-center rounded-full bg-prune-100 text-sm font-semibold text-prune-700`}>
      {name.slice(0, 1).toUpperCase()}
    </span>
  )
}
