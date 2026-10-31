import clsx from 'clsx'
import { CloudAlert, CloudCheck, LoaderCircle } from 'lucide-react'
import { useEffect } from 'react'
import { Tooltip } from '@/components/ui/Tooltip'
import { t } from '@/lib/i18n'
import { pendingWrites, useSaveStatus } from '@/lib/saveStatus'

/**
 * The editor saves each change as it is made, with no button: this says so,
 * so nobody closes the page afraid of losing their work (Clémence's test,
 * October 2026). It also holds the page while a change is still on its way.
 */
export function SaveIndicator() {
  const { state, savedAt } = useSaveStatus()

  useEffect(() => {
    const onLeave = (event: BeforeUnloadEvent) => {
      if (pendingWrites() === 0) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', onLeave)
    return () => window.removeEventListener('beforeunload', onLeave)
  }, [])

  const label = state === 'saving' ? t('maps.show.save.saving')
    : state === 'failed' ? t('maps.show.save.failed')
    : state === 'saved' && savedAt ? t('maps.show.save.saved_at', { time: clock(savedAt) })
    : t('maps.show.save.idle')
  const help = state === 'failed' ? t('maps.show.save.failed_help') : t('maps.show.save.help')
  const Icon = state === 'saving' ? LoaderCircle : state === 'failed' ? CloudAlert : CloudCheck

  return (
    <Tooltip content={help} side="bottom" className="shrink-0">
      <span
        role="status"
        aria-live="polite"
        tabIndex={0}
        className={clsx(
          'inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-sm outline-none focus-visible:ring-2 focus-visible:ring-prune-300',
          state === 'failed' ? 'bg-clay-50 text-clay-600' : 'text-loam-400',
        )}
      >
        <Icon className={clsx('h-4 w-4', state === 'saving' && 'animate-spin')} aria-hidden />
        <span className={clsx(state === 'failed' ? 'inline' : 'hidden lg:inline')}>{label}</span>
        {state !== 'failed' && <span className="sr-only lg:hidden">{label}</span>}
      </span>
    </Tooltip>
  )
}

function clock(at: number): string {
  return new Date(at).toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' }).replace(':', ' h ')
}
