// Crash and error reports to Semisto's Sentry, only when a DSN is set at
// build time (EXPO_PUBLIC_SENTRY_DSN, an EAS environment variable): without
// it, nothing is sent and the app works the same.
import * as Sentry from '@sentry/react-native'

const DSN = process.env.EXPO_PUBLIC_SENTRY_DSN

export const monitoringEnabled = !!DSN

if (DSN) {
  Sentry.init({
    dsn: DSN,
    // No personal data: no IP, no request bodies; the server knows who is who.
    sendDefaultPii: false,
    tracesSampleRate: 0,
  })
}

export function report(error: unknown, context?: Record<string, unknown>) {
  if (DSN) Sentry.captureException(error, context ? { extra: context } : undefined)
}

export { Sentry }
