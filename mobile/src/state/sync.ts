// Network awareness: sends the outbox as soon as the phone is back online.
import * as Network from 'expo-network'
import { useEffect, useSyncExternalStore } from 'react'
import { AppState } from 'react-native'
import { onAuthChange } from '@/lib/auth'
import { outbox, type SendProgress } from '@/lib/outbox'
import type { OutboxState } from '@/lib/outbox-core'

export function useOnline(): boolean {
  const state = Network.useNetworkState()
  return state.isInternetReachable ?? state.isConnected ?? true
}

/**
 * Flushes the outbox whenever connectivity, the app or the session comes
 * back. Mount once. A send cut off on the field (weak signal, app put in the
 * pocket) is tried again on a timer by the outbox itself; these cover the
 * moments that timer cannot see: the phone switching from mobile data to
 * wifi while staying online, and the app coming back to the foreground
 * (iOS pauses timers and requests in the background).
 */
export function useAutoSync(): void {
  const network = Network.useNetworkState()
  const online = network.isInternetReachable ?? network.isConnected ?? true
  useEffect(() => { if (online) void outbox.flush() }, [online, network.type])
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') void outbox.flush() })
    return () => subscription.remove()
  }, [])
  // Changes kept while the session had expired leave once signed in again.
  useEffect(() => onAuthChange((signedIn) => { if (signedIn) void outbox.flush() }), [])
}

export function useOutbox(): OutboxState {
  return useSyncExternalStore(outbox.subscribe, outbox.get)
}

/** The round being sent right now (n of N, which change), or null. */
export function useSendProgress(): SendProgress | null {
  return useSyncExternalStore(outbox.subscribeProgress, outbox.progress)
}
