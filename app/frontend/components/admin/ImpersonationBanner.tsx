import { Link, usePage } from '@inertiajs/react'
import { UserRoundCheck } from 'lucide-react'
import type { ReactNode } from 'react'
import { t } from '@/lib/i18n'
import { relativeTime } from '@/lib/relativeTime'
import type { SharedProps } from '@/types'

/**
 * « Tu es connecté en tant que … »: shown on every page while an admin is
 * signed in as someone else, with the way back. A fixed pill, so it also
 * sits on the full-screen map editor without changing its layout.
 */
export function ImpersonationBanner() {
  const { impersonation } = usePage().props as unknown as SharedProps
  if (!impersonation) return null
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-3 z-[70] flex justify-center px-3 print:hidden">
      <div
        role="status"
        className="pointer-events-auto flex max-w-full flex-wrap items-center gap-x-3 gap-y-1.5 rounded-2xl bg-humus-300 px-4 py-2.5 text-sm text-loam-900 shadow-lg ring-2 ring-humus-500"
      >
        <UserRoundCheck className="hidden h-4 w-4 shrink-0 sm:block" aria-hidden />
        <div className="min-w-0">
          <p className="font-semibold">{t('admin.impersonation.banner', { name: impersonation.userName })}</p>
          <p className="truncate text-xs text-loam-800">
            {t('admin.impersonation.banner_detail', { email: impersonation.userEmail, time: relativeTime(impersonation.endsAt) })}
          </p>
        </div>
        <Link
          href="/impersonation"
          method="delete"
          as="button"
          className="shrink-0 rounded-full bg-loam-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-loam-800"
        >
          {t('admin.impersonation.stop')}
        </Link>
      </div>
    </div>
  )
}

/** Outermost layout of every page: the page, plus the banner when needed. */
export default function ImpersonationFrame({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <ImpersonationBanner />
    </>
  )
}
