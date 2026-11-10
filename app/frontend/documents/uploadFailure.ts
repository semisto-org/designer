import * as Sentry from '@sentry/react'
import { sentryEnabled } from '@/lib/sentry'

export type UploadFailure = {
  endpoint: string
  file: File
  /** HTTP status, 0 when the connection was lost. */
  status: number
  /** network · refused (4xx/5xx) · redirected (signed out, sent elsewhere) · not_a_document (a 2xx without the saved document) */
  reason: 'network' | 'refused' | 'redirected' | 'not_a_document'
  code?: string
}

/**
 * A document that did not reach the library, told to Sentry as one grouped
 * issue per reason: the person sees the message on the page, and we see it
 * happened (status, size and type of the file, never its name).
 */
export function reportUploadFailure({ endpoint, file, status, reason, code }: UploadFailure) {
  if (!sentryEnabled) return
  Sentry.captureMessage('Document upload failed', {
    level: 'warning',
    fingerprint: ['document-upload-failed', reason],
    tags: { upload_reason: reason, upload_status: String(status), upload_code: code ?? 'none' },
    contexts: {
      upload: {
        endpoint: endpoint.replace(/\/[A-Za-z0-9_-]{20,}/g, '/…'),
        bytes: file.size,
        type: file.type || 'unknown',
      },
    },
  })
}
