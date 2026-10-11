import { useEffect, type Dispatch, type SetStateAction } from 'react'
import { api } from '@/lib/api'
import { t } from '@/lib/i18n'
import { formatBytes } from '@/map/photos/format'
import type { MapDocumentData } from '@/types/documents'

/** « 3,1 Mo », « 32 Mo · compression en cours… » or « 3,1 Mo, compressé (32 Mo envoyés) ». */
export function documentSize(doc: MapDocumentData): string {
  if (!doc.byteSize) return ''
  const size = formatBytes(doc.byteSize)
  if (doc.compression === 'pending') return t('documents.compression.pending', { size })
  if (doc.compression === 'compressed' && doc.originalByteSize) {
    return t('documents.compression.done', { size, original: formatBytes(doc.originalByteSize) })
  }
  return size
}

const POLL_EVERY = 5000
const MAX_POLLS = 120

/**
 * While a large PDF is being compressed on the server, asks `endpoint`
 * (the documents' JSON list) every few seconds and takes the new sizes.
 */
export function useCompressionRefresh(endpoint: string, docs: MapDocumentData[], setDocs: Dispatch<SetStateAction<MapDocumentData[]>>) {
  const pending = docs.some((d) => d.compression === 'pending')
  useEffect(() => {
    if (!pending) return
    let polls = 0
    let timer: ReturnType<typeof setTimeout>
    let stopped = false
    const tick = async () => {
      polls += 1
      try {
        const { documents } = await api<{ documents: MapDocumentData[] }>(endpoint)
        if (stopped) return
        const fresh = new Map(documents.map((d) => [d.id, d]))
        setDocs((list) => list.map((d) => (d.compression === 'pending' && fresh.get(d.id)?.compression !== 'pending' ? fresh.get(d.id) ?? d : d)))
        if (documents.every((d) => d.compression !== 'pending')) return
      } catch {
        // A missed refresh is retried at the next tick.
      }
      if (!stopped && polls < MAX_POLLS) timer = setTimeout(tick, POLL_EVERY)
    }
    timer = setTimeout(tick, POLL_EVERY)
    return () => {
      stopped = true
      clearTimeout(timer)
    }
  }, [endpoint, pending, setDocs])
}
