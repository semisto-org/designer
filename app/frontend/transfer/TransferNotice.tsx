import { Link } from '@inertiajs/react'
import { KeyRound } from 'lucide-react'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { tf } from '@/lib/content'
import { useEditor } from '@/map/editor/EditorContext'
import type { IncomingTransferNotice, TransferSectionData } from '@/types/transfer'

/**
 * Map editor header: when the owner proposes the map to me (an editor), a
 * notice that leads to the proposal's screen (what changes, plan impact,
 * accept or decline). Only editors can receive a map, so nobody else asks.
 */
export default function TransferNotice() {
  const { map } = useEditor()
  const [incoming, setIncoming] = useState<IncomingTransferNotice | null>(null)

  useEffect(() => {
    if (map.role !== 'editor') return
    let live = true
    api<TransferSectionData>(`/maps/${map.id}/transfers`)
      .then((data) => { if (live) setIncoming(data.incoming ?? null) })
      .catch(() => {})
    return () => { live = false }
  }, [map.id, map.role])

  if (!incoming) return null
  const label = tf('transfer.notice.header_title', { from: incoming.fromName })
  return (
    <Link
      href={incoming.path}
      title={label}
      aria-label={label}
      className="relative inline-flex h-8 items-center gap-1.5 rounded-full bg-prune-600 px-3 text-xs font-medium text-white shadow-sm hover:bg-prune-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-prune-600"
    >
      <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
      <span className="hidden sm:inline">{tf('transfer.notice.header')}</span>
      <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-humus-400 ring-2 ring-white sm:hidden" aria-hidden="true" />
    </Link>
  )
}
