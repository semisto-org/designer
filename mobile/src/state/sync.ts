// Network awareness: sends the outbox as soon as the phone is back online.
import * as Network from 'expo-network'
import { useEffect, useSyncExternalStore } from 'react'
import { onAuthChange } from '@/lib/auth'
import { outbox } from '@/lib/outbox'
import type { OutboxState } from '@/lib/outbox-core'

export function useOnline(): boolean {
  const state = Network.useNetworkState()
  return state.isInternetReachable ?? state.isConnected ?? true
}

/** Flushes the outbox whenever connectivity or the session comes back. Mount once. */
export function useAutoSync(): void {
  const online = useOnline()
  useEffect(() => { if (online) void outbox.flush() }, [online])
  // Changes kept while the session had expired leave once signed in again.
  useEffect(() => onAuthChange((signedIn) => { if (signedIn) void outbox.flush() }), [])
}

export function useOutbox(): OutboxState {
  return useSyncExternalStore(outbox.subscribe, outbox.get)
}
