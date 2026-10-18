import { api } from '@/lib/api'

export type GbifStatus = 'accepted' | 'synonym' | 'fuzzy' | 'unknown' | 'unavailable'

export type GbifCheck = {
  match: { status: GbifStatus; name?: string | null; suggestedName?: string | null; family?: string | null; url?: string | null }
  commonNames: { name: string; language: string; sources: string[]; known: boolean }[]
}

// The queue can hold hundreds of species: ask GBIF a few at a time, in the
// order the cards appear, rather than all at once.
const CONCURRENCY = 4
let running = 0
const waiting: (() => void)[] = []

function next() {
  if (running >= CONCURRENCY) return
  const job = waiting.shift()
  if (!job) return
  running += 1
  job()
}

export function gbifCheck(speciesId: number): Promise<GbifCheck> {
  return new Promise((resolve) => {
    waiting.push(() => {
      api<GbifCheck>(`/plants/review/${speciesId}/gbif`, { method: 'POST' })
        .catch((): GbifCheck => ({ match: { status: 'unavailable' }, commonNames: [] }))
        .then(resolve)
        .finally(() => { running -= 1; next() })
    })
    next()
  })
}
