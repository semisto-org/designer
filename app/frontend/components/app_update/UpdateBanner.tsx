import { usePage } from '@inertiajs/react'
import { Sprout } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { t } from '@/lib/i18n'

// How often an open page asks the server which version is deployed: every
// ten minutes while visible, and when it comes back to the foreground (an
// iPad home-screen app resumes where it was, it never reloads on its own),
// at most once a minute.
const POLL_MS = 10 * 60 * 1000
const MIN_GAP_MS = 60 * 1000

/** The deployed frontend version, or null when the server can't be reached. */
async function fetchDeployedVersion(): Promise<string | null> {
  try {
    const res = await fetch('/version', { cache: 'no-store', headers: { Accept: 'application/json' } })
    if (!res.ok) return null
    const body = (await res.json()) as { version?: unknown }
    return typeof body.version === 'string' && body.version ? body.version : null
  } catch {
    return null
  }
}

/**
 * The version deployed on the server when it differs from the one this page
 * was built with. Inertia already reloads on its own when a link is followed
 * after a deploy; this covers pages that stay open without navigating (the
 * map editor works through JSON calls) and the installed app, which has no
 * reload button.
 */
export function useNewVersion(): string | null {
  const loaded = usePage().version
  const [deployed, setDeployed] = useState<string | null>(null)
  const lastCheck = useRef(0)

  useEffect(() => {
    if (import.meta.env.DEV || !loaded) return
    let cancelled = false
    const check = async (force = false) => {
      if (document.visibilityState !== 'visible') return
      const now = Date.now()
      if (!force && now - lastCheck.current < MIN_GAP_MS) return
      lastCheck.current = now
      const version = await fetchDeployedVersion()
      if (!cancelled && version && version !== loaded) setDeployed(version)
    }
    const onVisible = () => void check()
    const onShow = (event: PageTransitionEvent) => {
      if (event.persisted) void check(true)
    }
    const timer = window.setInterval(() => void check(true), POLL_MS)
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('pageshow', onShow)
    window.addEventListener('online', onVisible)
    return () => {
      cancelled = true
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('pageshow', onShow)
      window.removeEventListener('online', onVisible)
    }
  }, [loaded])

  return deployed
}

/**
 * « Une nouvelle version du Designer a poussé » with « Recharger »: shown on
 * every page once a newer version is deployed. « Plus tard » hides it until
 * the next deploy.
 */
export default function UpdateBanner() {
  const deployed = useNewVersion()
  const [dismissed, setDismissed] = useState<string | null>(null)
  if (!deployed || deployed === dismissed) return null
  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-[65] flex justify-center px-3 print:hidden"
      style={{ top: 'max(0.75rem, env(safe-area-inset-top))' }}
    >
      <div
        role="status"
        className="pointer-events-auto flex max-w-full flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl bg-white px-4 py-2.5 text-sm text-loam-900 shadow-lg ring-1 ring-loam-200"
      >
        <Sprout className="hidden h-5 w-5 shrink-0 text-leaf-600 sm:block" aria-hidden />
        <div className="min-w-0">
          <p className="font-semibold">{t('app_update.title')}</p>
          <p className="text-xs text-loam-700">{t('app_update.detail')}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setDismissed(deployed)}
            className="rounded-full px-3 py-1.5 text-xs font-semibold text-loam-700 hover:bg-loam-100"
          >
            {t('app_update.later')}
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-full bg-prune-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-prune-700"
          >
            {t('app_update.reload')}
          </button>
        </div>
      </div>
    </div>
  )
}
