import { Editor } from '@tiptap/core'
import { useEffect, useRef, useState } from 'react'
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate, removeAwarenessStates } from 'y-protocols/awareness'
import * as Y from 'yjs'
import { fromBase64, seedFromDoc, toBase64 } from '@/documents/markdown/collabSeed'
import { markdownExtensions } from '@/documents/markdown/extensions'
import { api } from '@/lib/api'
import { cable } from '@/lib/cable'

export type CollabUser = { name: string; color: string }
export type Peer = CollabUser & { clientId: number }
/** The shared text of a page and who is on it, handed to the editor. */
export type CollabSession = {
  doc: Y.Doc
  awareness: Awareness
  user: CollabUser
  /** Which shared text this is: a new one starts when the file is rewritten from elsewhere. */
  epoch: number
  /** Someone else edited since the page opened: their edits are saved too. */
  touched: { current: boolean }
}
export type External = { type: 'saved' } | { type: 'reset'; whileEditing: boolean }

type State = { content: string; checksum: string | null; epoch: number; updates: string[]; lastId: number | null }
type Message = {
  type: 'update' | 'awareness' | 'hello' | 'saved' | 'reset' | 'error'
  update?: string | null
  from?: string
  epoch?: number
}

// Past this many edits kept on the server, the one who joins merges them.
const COMPACT_AFTER = 100
// The colours of the people writing, from the Semisto palette.
const COLORS = ['#5b5781', '#6d7a00', '#a05f00', '#9c1716', '#2f6b6b', '#5a604e', '#8a3f78']

export function colorFor(id: number): string {
  return COLORS[Math.abs(id) % COLORS.length]
}

/**
 * The live page of a Markdown document (MapDocumentChannel). Everyone on it
 * hears when the text is saved or rewritten from elsewhere (`onExternal`);
 * while `editing`, the page also holds the shared text (a Yjs document) that
 * the editors write together, with where each one's cursor is.
 *
 * Joining: the edits made together so far come from the server, in order;
 * when there are none yet, the text starts from the Markdown file, built
 * the same way in every browser (seedFromDoc), so that two people opening
 * the page at once start from one text, not two. After a
 * lost connection, the page fetches the edits again and sends the ones the
 * server missed. When the file is rewritten from elsewhere (an AI through
 * the MCP), the server starts a new epoch and the page starts again from it.
 */
export function useCollab({ documentId, url, editing, user, onExternal }: {
  documentId: number
  /** `/maps/:map_id/documents/:id` */
  url: string
  editing: boolean
  user: CollabUser
  onExternal: (event: External) => void
}) {
  const [session, setSession] = useState<CollabSession | null>(null)
  const [peers, setPeers] = useState<Peer[]>([])
  const [generation, setGeneration] = useState(0)
  const external = useRef(onExternal)
  external.current = onExternal
  const userRef = useRef(user)
  userRef.current = user

  useEffect(() => {
    const client = Math.random().toString(36).slice(2, 12)
    let epoch: number | null = null
    let closed = false
    let doc: Y.Doc | null = null
    let awareness: Awareness | null = null
    const touched = { current: false }
    // Edits heard while the page is still fetching the text: applied after it.
    const early: Message[] = []

    const subscription = cable().subscriptions.create(
      { channel: 'MapDocumentChannel', document_id: documentId, client },
      {
        connected: () => { if (editing) void join() },
        received: (message: Message) => receive(message),
      },
    )

    function send(action: string, data: Record<string, unknown>) {
      subscription.perform(action, data)
    }

    function restart() {
      if (closed) return
      closed = true
      setGeneration((g) => g + 1)
    }

    function receive(message: Message) {
      if (closed || (message.from && message.from === client)) return
      switch (message.type) {
        case 'saved':
          if (!editing) external.current({ type: 'saved' })
          break
        case 'reset':
          if (editing && message.epoch === epoch) break
          external.current({ type: 'reset', whileEditing: editing })
          if (editing) restart()
          break
        case 'update':
          if (!doc) { if (editing) early.push(message); break }
          if (!message.update || message.epoch !== epoch) break
          touched.current = true
          Y.applyUpdate(doc, fromBase64(message.update), 'remote')
          break
        case 'awareness':
          if (awareness && message.update) applyAwarenessUpdate(awareness, fromBase64(message.update), 'remote')
          break
        case 'hello':
          if (doc && awareness) send('awareness', { update: toBase64(encodeAwarenessUpdate(awareness, [doc.clientID])) })
          break
      }
    }

    async function join() {
      let state: State
      try {
        state = await api<State>(`${url}/collab`)
      } catch {
        return
      }
      if (closed) return
      const updates = state.updates.map(fromBase64)
      if (doc && awareness) {
        // Back after a lost connection: catch up, then send what the server missed.
        if (state.epoch !== epoch) return restart()
        Y.transact(doc, () => updates.forEach((u) => Y.applyUpdate(doc!, u)), 'remote')
        const server = new Y.Doc()
        updates.forEach((u) => Y.applyUpdate(server, u))
        const missed = Y.encodeStateAsUpdate(doc, Y.encodeStateVector(server))
        server.destroy()
        if (missed.length > 2) send('update', { update: toBase64(missed), epoch })
        send('hello', {})
        send('awareness', { update: toBase64(encodeAwarenessUpdate(awareness, [doc.clientID])) })
        return
      }

      epoch = state.epoch
      doc = new Y.Doc()
      awareness = new Awareness(doc)
      const shared = doc
      const presence = awareness
      Y.transact(shared, () => updates.forEach((u) => Y.applyUpdate(shared, u)), 'remote')
      shared.on('update', (update: Uint8Array, origin: unknown) => {
        if (origin !== 'remote') send('update', { update: toBase64(update), epoch })
      })
      // The first one here starts the text from the file (see above).
      if (updates.length === 0) Y.applyUpdate(shared, seedUpdate(state.content), 'seed')
      presence.on('update', ({ added, updated, removed }: AwarenessChange, origin: unknown) => {
        if (origin !== 'local') return
        const mine = [...added, ...updated, ...removed].filter((id) => id === shared.clientID)
        if (mine.length) send('awareness', { update: toBase64(encodeAwarenessUpdate(presence, mine)) })
      })
      presence.on('change', () => setPeers(peersOf(presence, shared.clientID)))
      early.splice(0).forEach(receive)
      if (updates.length > COMPACT_AFTER && state.lastId) {
        send('compact', { update: toBase64(Y.mergeUpdates(updates)), last_id: state.lastId, epoch })
      }
      setSession({ doc: shared, awareness: presence, user: userRef.current, epoch: state.epoch, touched })
      send('hello', {})
    }

    function leave() {
      if (doc && awareness) removeAwarenessStates(awareness, [doc.clientID], 'local')
    }
    window.addEventListener('pagehide', leave)

    return () => {
      window.removeEventListener('pagehide', leave)
      leave()
      closed = true
      subscription.unsubscribe()
      awareness?.destroy()
      doc?.destroy()
      setSession(null)
      setPeers([])
    }
  }, [documentId, url, editing, generation])

  return { session, peers }
}

type AwarenessChange = { added: number[]; updated: number[]; removed: number[] }

// The others on the page, once each (the same person in two tabs counts once).
function peersOf(awareness: Awareness, self: number): Peer[] {
  const seen = new Set<string>()
  const peers: Peer[] = []
  awareness.getStates().forEach((state, clientId) => {
    const user = state.user as CollabUser | undefined
    if (clientId === self || !user?.name) return
    const key = `${user.name}|${user.color}`
    if (seen.has(key)) return
    seen.add(key)
    peers.push({ ...user, clientId })
  })
  return peers
}

/** The Markdown file as the first edit of the shared text (see seedFromDoc). */
function seedUpdate(markdown: string): Uint8Array {
  const editor = new Editor({ extensions: markdownExtensions({ editable: false }), content: markdown, contentType: 'markdown' })
  const update = seedFromDoc(editor.state.doc)
  editor.destroy()
  return update
}
