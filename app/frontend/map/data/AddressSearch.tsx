import clsx from 'clsx'
import { Loader2, MapPin, Search } from 'lucide-react'
import { useId, useRef, useState, type KeyboardEvent } from 'react'
import { buttonClass } from '@/components/ui/Button'
import { inputClass } from '@/components/ui/Field'
import { ApiError, api } from '@/lib/api'
import { t } from '@/lib/i18n'
import type { GeocodeResponse, GeocodeResult } from '@/types/map_data'

// The front door's field: the same ink and focus ring as inputClass, as a tall pill.
const LARGE_INPUT =
  'block w-full min-h-14 rounded-full border-0 bg-white px-5 text-lg text-loam-900 shadow-sm ring-1 ring-inset ring-loam-900/20 ' +
  'placeholder:text-loam-400 focus:ring-2 focus:ring-inset focus:ring-prune-600'

type Status = 'idle' | 'loading' | 'done' | 'error' | 'disabled'

type Props = {
  regionId?: number | null
  onSelect: (result: GeocodeResult) => void
  label?: string
  placeholder?: string
  className?: string
  initialQuery?: string
  /** Another search endpoint (a public form has its own). */
  endpoint?: string
  /** `lg`: the home page's front door, a tall field and a worded button. */
  size?: 'md' | 'lg'
  /** The button's words at size `lg` (otherwise a magnifier alone). */
  submitLabel?: string
}

/**
 * Address search (Providers::Geocoder). It searches on Enter or on the
 * button, never as you type: the default provider (public Nominatim)
 * forbids autocomplete. Usable inside another form (it renders no <form>).
 */
export function AddressSearch({ regionId, onSelect, label, placeholder, className, initialQuery = '', endpoint = '/geocode', size = 'md', submitLabel }: Props) {
  const [query, setQuery] = useState(initialQuery)
  const [status, setStatus] = useState<Status>('idle')
  const [message, setMessage] = useState<string | null>(null)
  const [results, setResults] = useState<GeocodeResult[]>([])
  const abort = useRef<AbortController | null>(null)
  const id = useId()
  const large = size === 'lg'

  async function search() {
    const q = query.trim()
    if (q.length < 3) {
      setStatus('done')
      setResults([])
      setMessage(t('map_data.search.too_short'))
      return
    }
    abort.current?.abort()
    const controller = new AbortController()
    abort.current = controller
    setStatus('loading')
    setMessage(null)
    try {
      const params = new URLSearchParams({ q })
      if (regionId) params.set('region_id', String(regionId))
      const data = await api<GeocodeResponse>(`${endpoint}?${params}`, { signal: controller.signal })
      if (!data.available) {
        setStatus('disabled')
        setResults([])
        setMessage(t('map_data.search.disabled'))
        return
      }
      setResults(data.results)
      setStatus('done')
      setMessage(data.results.length === 0 ? t('map_data.search.no_results') : null)
    } catch (error) {
      if ((error as Error).name === 'AbortError') return
      setStatus('error')
      setResults([])
      setMessage(error instanceof ApiError && error.status !== 500 ? error.message : t('map_data.search.error'))
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      void search()
    } else if (e.key === 'Escape' && results.length) {
      e.preventDefault()
      setResults([])
    }
  }

  function choose(result: GeocodeResult) {
    setQuery(result.label)
    setResults([])
    setMessage(null)
    setStatus('idle')
    onSelect(result)
  }

  return (
    <div className={className}>
      {label && <label htmlFor={`${id}-q`} className={clsx('mb-1 block font-medium text-loam-700', large ? 'text-base' : 'text-sm')}>{label}</label>}
      <div className={clsx('flex gap-2', large && 'flex-col sm:flex-row')} role="search">
        <input
          id={`${id}-q`}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder ?? t('map_data.search.placeholder')}
          autoComplete="street-address"
          enterKeyHint="search"
          disabled={status === 'disabled'}
          aria-describedby={message ? `${id}-message` : undefined}
          aria-controls={results.length ? `${id}-results` : undefined}
          className={clsx(large ? LARGE_INPUT : inputClass, 'min-w-0 flex-1')}
        />
        <button
          type="button"
          onClick={() => void search()}
          disabled={status === 'loading' || status === 'disabled'}
          aria-label={large && submitLabel ? undefined : t('map_data.search.submit')}
          className={large
            ? buttonClass('primary', 'lg', 'min-h-14 shrink-0')
            : 'inline-flex shrink-0 items-center justify-center rounded-lg bg-white px-3 text-loam-700 ring-1 ring-inset ring-loam-200 hover:bg-loam-100 disabled:opacity-50'}
        >
          {status === 'loading' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Search className="h-4 w-4" aria-hidden="true" />}
          {large && submitLabel}
        </button>
      </div>
      {message && (
        <p id={`${id}-message`} role="status" className={clsx('mt-1.5', large ? 'text-sm' : 'text-xs', status === 'error' ? 'text-clay-500' : 'text-loam-500')}>
          {message}
        </p>
      )}
      {results.length > 0 && (
        <ul id={`${id}-results`} aria-label={t('map_data.search.results')} className={clsx('mt-1.5 divide-y divide-loam-100 overflow-hidden bg-white ring-1 ring-loam-200', large ? 'rounded-2xl shadow-lg' : 'rounded-lg')}>
          {results.map((result, index) => (
            <li key={`${result.lng},${result.lat},${index}`}>
              <button
                type="button"
                onClick={() => choose(result)}
                className={clsx('flex w-full items-start gap-2 text-left', large ? 'px-4 py-3' : 'px-3 py-2', 'hover:bg-prune-50 focus:bg-prune-50 focus:outline-none')}
              >
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-prune-500" aria-hidden="true" />
                <span className="min-w-0">
                  <span className={clsx('block truncate text-loam-800', large ? 'text-base' : 'text-sm')}>{result.label}</span>
                  {result.detail && <span className={clsx('block truncate text-loam-500', large ? 'text-sm' : 'text-xs')}>{result.detail}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
