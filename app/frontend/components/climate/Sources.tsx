import { ExternalLink } from 'lucide-react'
import { t } from '@/lib/i18n'
import type { ClimateSource } from '@/types/climate_finance'

/** Where the figures come from, and how they were built. */
export function Sources({ sources, note }: { sources: ClimateSource[]; note: string | null }) {
  if (sources.length === 0) return null
  return (
    <details className="rounded-lg bg-loam-50 p-2.5 text-xs text-loam-600">
      <summary className="cursor-pointer font-medium text-loam-700">{t('climate.sources.title')}</summary>
      <p className="mt-2">{t('climate.sources.method')}</p>
      {note && <p className="mt-1.5">{note}</p>}
      <ul className="mt-2 space-y-1.5">
        {sources.map((source) => (
          <li key={source.key}>
            <span className="text-loam-800">{source.publisher}</span>
            {source.year && <span> ({source.year})</span>}
            <span> — {source.title}</span>
            {source.url && (
              <a href={source.url} target="_blank" rel="noreferrer" className="ml-1 inline-flex items-center text-prune-700 hover:underline" aria-label={source.url}>
                <ExternalLink className="h-3 w-3" aria-hidden />
              </a>
            )}
          </li>
        ))}
      </ul>
    </details>
  )
}
