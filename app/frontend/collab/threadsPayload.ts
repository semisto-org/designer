import type { ThreadSummary } from '../types/collab'

/**
 * The thread list from a `/comments/threads` answer, or null when the answer
 * carries none (an empty or non-JSON body read as `{}`), so a bad answer keeps
 * the last known list instead of breaking every reader of the store.
 */
export function readThreadList(data: unknown): { threads: ThreadSummary[]; commentEmails: boolean } | null {
  const payload = data as { threads?: unknown; commentEmails?: unknown } | null | undefined
  if (!payload || !Array.isArray(payload.threads)) return null
  return { threads: payload.threads as ThreadSummary[], commentEmails: payload.commentEmails !== false }
}
