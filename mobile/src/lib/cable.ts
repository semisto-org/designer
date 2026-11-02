// A small Action Cable client for the phone (the website uses
// @rails/actioncable, which needs a browser's cookies). One WebSocket to
// the server's /cable, signed in with the app's bearer token
// (ApplicationCable::Connection), carrying any number of channel
// subscriptions. It reconnects by itself (1 s, then doubling up to 30 s),
// when the token was refreshed, and when the app comes back to the
// foreground; subscriptions are sent again on each new connection.
import { AppState } from 'react-native'
import { accessToken } from './auth'
import { API_URL } from './config'

type Handlers = { received: (message: unknown) => void; connected?: () => void; disconnected?: () => void; rejected?: () => void }
type Subscription = { identifier: string; handlers: Handlers }

const PROTOCOLS = ['actioncable-v1-json', 'actioncable-unsupported']
/** The server pings every 3 s; without one for this long the line is dead. */
const STALE_MS = 12_000

const cableUrl = () => `${API_URL.replace(/^http/, 'ws')}/cable`

let socket: WebSocket | null = null
let opening = false
let attempts = 0
let retryTimer: ReturnType<typeof setTimeout> | null = null
let staleTimer: ReturnType<typeof setInterval> | null = null
let lastSeen = 0
const subscriptions = new Map<string, Subscription>()

function send(command: Record<string, unknown>) {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(command))
}

function close() {
  if (staleTimer) clearInterval(staleTimer)
  staleTimer = null
  const old = socket
  socket = null
  if (old) {
    subscriptions.forEach((s) => s.handlers.disconnected?.())
    old.onopen = old.onmessage = old.onclose = old.onerror = null
    try { old.close() } catch { /* already closed */ }
  }
}

function scheduleReconnect() {
  if (retryTimer || subscriptions.size === 0) return
  const delay = Math.min(1000 * 2 ** attempts, 30_000)
  attempts += 1
  retryTimer = setTimeout(() => { retryTimer = null; void open() }, delay)
}

async function open(refresh = false) {
  if (opening || socket || subscriptions.size === 0) return
  opening = true
  let token: string | null = null
  try { token = await accessToken(refresh ? { force: true } : undefined) } catch { token = null }
  opening = false
  if (!token) { scheduleReconnect(); return }
  // React Native's WebSocket takes headers as a third argument.
  const ws = new (WebSocket as unknown as new (url: string, protocols: string[], options: { headers: Record<string, string> }) => WebSocket)(
    cableUrl(), PROTOCOLS, { headers: { Authorization: `Bearer ${token}` } })
  socket = ws
  lastSeen = Date.now()
  ws.onmessage = (event) => {
    lastSeen = Date.now()
    let data: { type?: string; identifier?: string; message?: unknown; reason?: string; reconnect?: boolean }
    try { data = JSON.parse(String(event.data)) } catch { return }
    if (data.type === 'welcome') {
      attempts = 0
      subscriptions.forEach((s) => send({ command: 'subscribe', identifier: s.identifier }))
    } else if (data.type === 'ping') {
      // Keeps lastSeen fresh.
    } else if (data.type === 'disconnect') {
      close()
      // An expired token: one fresh try with a refreshed one.
      if (data.reason === 'unauthorized') void open(true)
      else if (data.reconnect !== false) scheduleReconnect()
    } else if (data.type === 'confirm_subscription' && data.identifier) {
      subscriptions.get(data.identifier)?.handlers.connected?.()
    } else if (data.type === 'reject_subscription' && data.identifier) {
      subscriptions.get(data.identifier)?.handlers.rejected?.()
    } else if (data.identifier && data.message !== undefined) {
      subscriptions.get(data.identifier)?.handlers.received(data.message)
    }
  }
  ws.onclose = () => { if (socket === ws) { close(); scheduleReconnect() } }
  ws.onerror = () => { if (socket === ws) { close(); scheduleReconnect() } }
  staleTimer = setInterval(() => {
    if (Date.now() - lastSeen > STALE_MS && socket === ws) { close(); scheduleReconnect() }
  }, STALE_MS / 2)
}

AppState.addEventListener('change', (state) => {
  if (state !== 'active' || subscriptions.size === 0) return
  // iOS drops sockets in the background: start again at once, no waiting.
  if (retryTimer) { clearTimeout(retryTimer); retryTimer = null }
  attempts = 0
  if (!socket || Date.now() - lastSeen > STALE_MS) { close(); void open() }
})

/**
 * Subscribes to a channel (`{ channel: 'MapChatChannel', map_id: 12 }`);
 * returns the unsubscribe. `connected` runs on each (re)connection: the
 * moment to read again what may have been missed.
 */
export function subscribe(params: Record<string, unknown>, handlers: Handlers): () => void {
  const identifier = JSON.stringify(params)
  subscriptions.set(identifier, { identifier, handlers })
  if (socket?.readyState === WebSocket.OPEN) send({ command: 'subscribe', identifier })
  else void open()
  return () => {
    if (subscriptions.get(identifier)?.handlers !== handlers) return
    subscriptions.delete(identifier)
    send({ command: 'unsubscribe', identifier })
    if (subscriptions.size === 0) {
      if (retryTimer) { clearTimeout(retryTimer); retryTimer = null }
      close()
    }
  }
}
