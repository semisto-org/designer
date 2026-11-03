import { useEffect, type Dispatch, type SetStateAction } from 'react'
import { api } from '@/lib/api'
import type { MapDocumentData } from '@/types/documents'

const POLL_EVERY = 3000
const MAX_POLLS = 100

/**
 * While the server turns a .docx into a PDF (ConvertMapDocumentToPdfJob),
 * asks `endpoint` (the documents' JSON list) every few seconds; once done,
 * the source takes its new state and the PDF joins the library.
 */
export function usePdfConversionRefresh(endpoint: string, docs: MapDocumentData[], setDocs: Dispatch<SetStateAction<MapDocumentData[]>>) {
  const pending = docs.some((d) => d.pdfConversion === 'pending')
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
        setDocs((list) => {
          const done = list.filter((d) => d.pdfConversion === 'pending' && fresh.get(d.id)?.pdfConversion !== 'pending')
          if (done.length === 0) return list
          const known = new Set(list.map((d) => d.id))
          const copies = documents.filter((d) => !known.has(d.id) && done.some((s) => s.id === d.convertedFromId))
          return [...copies, ...list.map((d) => (done.includes(d) ? fresh.get(d.id) ?? d : d))]
        })
        if (documents.every((d) => d.pdfConversion !== 'pending')) return
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
