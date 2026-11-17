import { lazy, Suspense, type ComponentType } from 'react'
import { Button } from '@/components/ui/Button'
import { SkeletonText } from '@/components/ui/Skeleton'
import { t } from '@/lib/i18n'

type Module<P> = { default: ComponentType<P> }

/** A component whose code is fetched the first time it shows; `preload` fetches it ahead. */
export type Deferred<P> = ComponentType<P> & { preload: () => void }

/**
 * A panel or inspector section whose code is fetched when it first opens,
 * not with the editor: on an old laptop, every panel parsed up front cost
 * seconds before the map could show (map/performance). `preload` lets the
 * rail fetch a panel while the pointer is on its button.
 *
 * `placeholder`: `text` (a few breathing lines) for a panel, `none` for an
 * inspector section, which simply appears a moment later.
 */
export function deferred<P extends object>(load: () => Promise<Module<P>>, placeholder: 'text' | 'none' = 'text'): Deferred<P> {
  let loading: Promise<Module<P>> | null = null
  // One retry, for a dropped request. If it fails again, the notice below
  // stands in for the component: a new release cannot be retried away.
  const once = () => (loading ??= load().catch(() => load()).catch(() => ({ default: LoadFailed as ComponentType<P> })))
  const Lazy = lazy(once)
  const Loaded = (props: P) => (
    <Suspense fallback={placeholder === 'text' ? <SkeletonText /> : null}>
      <Lazy {...props} />
    </Suspense>
  )
  return Object.assign(Loaded, { preload: () => void once() })
}

/**
 * The code could not be fetched: usually Terranova was updated while the map
 * was open, and the old files are gone. Reloading the page gets the new ones;
 * everything already drawn is saved on the server.
 */
function LoadFailed() {
  return (
    <div role="alert" className="space-y-2 rounded-lg bg-humus-50 p-3 text-sm text-humus-800">
      <p>{t('editor.load_failed')}</p>
      <Button size="sm" variant="secondary" onClick={() => window.location.reload()}>{t('editor.reload')}</Button>
    </div>
  )
}

/** Starts fetching a panel's code ahead, if it is deferred: the pointer is on its button. */
export function preload(component: object) {
  if ('preload' in component && typeof component.preload === 'function') component.preload()
}
