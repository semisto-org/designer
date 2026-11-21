import * as Sentry from '@sentry/react'
import { reloadingForFreshBuild } from '@/lib/staleChunks'

// Browser error tracking. The DSN comes from a meta tag rendered by the
// server (ApplicationHelper#sentry_meta_tags), never from the build: without
// SENTRY_DSN nothing is sent and nothing is initialised.
function meta(name: string): string | undefined {
  return document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)?.content || undefined
}

const dsn = meta('sentry-dsn')

if (dsn) {
  Sentry.init({
    dsn,
    environment: meta('sentry-environment'),
    // Session Replay is added later, only for people who said yes
    // (lib/replay.ts), and started by hand: nothing is sampled.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    // A tab reloading itself for a fresh build (lib/staleChunks.ts) throws
    // on its way out; the reload is the fix, so nothing is reported.
    beforeSend: (event) => (reloadingForFreshBuild() ? null : event),
  })
}

export const sentryEnabled = Boolean(dsn)
