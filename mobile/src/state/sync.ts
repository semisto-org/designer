// Network awareness: sends the outbox as soon as the phone is back online.
import * as Network from 'expo-network'
import { useEffect, useSyncExternalStore } from 'react'
import { outbox } from '@/lib/outbox'
import type { OutboxState } from '@/lib/outbox-core'

export function useOnline(): boolean {
  const state = Network.useNetworkState()
  return state.isInternetReachable ?? state.isConnected ?? true
}

/** Flushes the outbox whenever connectivity comes back. Mount once. */
export function useAutoSync(): void {
  const online = useOnline()
  useEffect(() => { if (online) void outbox.flush() }, [online])
}

export function useOutbox(): OutboxState {
  return useSyncExternalStore(outbox.subscribe, outbox.get)
}
