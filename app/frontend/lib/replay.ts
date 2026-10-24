import { addIntegration, captureFeedback, getClient, getReplay, replayCanvasIntegration, replayIntegration, setUser } from '@sentry/react'
import { api } from '@/lib/api'
import type { ReplayState } from '@/types'

// Sentry Session Replay, only for the people who said yes to the question of
// FirstHourHost (SessionReplayConsent on the server): this module is loaded
// for them alone. What they type, rich text, photos and anything marked
// data-private (the account menu, sharing, discussions) stays masked; the
// map's canvas is filmed twice a second, so the replay shows the place.

let installed = false

function install(): boolean {
  if (installed) return true
  if (!getClient()) return false
  // The canvas integration first: the replay reads its options when added.
  addIntegration(replayCanvasIntegration())
  addIntegration(replayIntegration({
    maskAllText: false,
    maskAllInputs: true,
    blockAllMedia: false,
    mask: ['[contenteditable]', '[data-private]'],
    block: ['img', 'video'],
  }))
  installed = true
  return true
}

async function stop() {
  setUser(null)
  await getReplay()?.stop({ flush: false })
}

/**
 * Follows the server's state on each page: starts or picks up the session
 * ("record"), picks it up only when the server already knows it ("keep"),
 * stops it otherwise.
 */
export async function followReplay(state: ReplayState, userId: number): Promise<void> {
  if (state !== 'record' && state !== 'keep') {
    if (installed) await stop()
    return
  }
  if (!install()) return
  const replay = getReplay()
  if (!replay) return
  // Picks up this tab's session while it is open (Sentry keeps it in
  // sessionStorage), or opens a new one, which the server may refuse.
  replay.start()
  const replayId = replay.getReplayId()
  if (!replayId) return
  setUser({ id: String(userId) })
  try {
    const answer = await api<{ recorded: boolean }>('/account/session_replays', {
      method: 'POST',
      body: { replay_id: replayId, path: window.location.pathname },
    })
    if (!answer.recorded) await stop()
  } catch {
    await stop()
  }
}

/** The replay being recorded, if any. */
export function currentReplayId(): string | undefined {
  return installed ? getReplay()?.getReplayId() : undefined
}

/** A copy of « Un retour ? » in Sentry's User Feedback, tied to the replay being recorded. */
export function sendFeedbackToSentry(message: string, mapId: number | null) {
  captureFeedback(
    { message, url: window.location.href, source: 'terranova', tags: mapId ? { map_id: mapId } : undefined },
    { includeReplay: true },
  )
}
