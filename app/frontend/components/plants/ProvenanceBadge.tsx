import clsx from 'clsx'
import { useState } from 'react'
import { t } from '@/lib/i18n'
import { formatDate } from '@/components/plants/format'
import type { Provenance } from '@/types/plants'

const TONES: Record<string, string> = {
  sourced: 'bg-leaf-50 text-leaf-700 ring-leaf-200',
  to_verify: 'bg-humus-50 text-humus-700 ring-humus-200',
  empty: 'bg-loam-50 text-loam-400 ring-loam-200',
}

export function sourceLabel(source: string): string {
  const label = t(`plants.sources.${source}`)
  return label.startsWith('⟨') || label === source ? source.charAt(0).toUpperCase() + source.slice(1) : label
}

/**
 * Where a value comes from: a small pill (« Semisto · à vérifier ») that
 * opens the details (upstream source, licence, link, date). Values from
 * PFAF only ever cite PFAF: no text of theirs is shown.
 */
export function ProvenanceBadge({ provenance }: { provenance: Provenance | undefined }) {
  const [open, setOpen] = useState(false)
  if (!provenance) return null
  const status = provenance.status
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        title={t('plants.provenance.details')}
        className={clsx('inline-flex items-center gap-1 rounded-full px-1.5 py-px text-[11px] leading-4 ring-1 ring-inset', TONES[status])}
      >
        <span>{sourceLabel(provenance.source)}</span>
        {status !== 'sourced' && <span className="opacity-90">· {t(`plants.provenance.statuses.${status}`)}</span>}
      </button>
      {open && (
        <span className="absolute left-0 top-full z-20 mt-1 w-64 rounded-lg bg-white p-3 text-left text-xs text-loam-600 shadow-lg ring-1 ring-loam-200">
          <span className="block font-medium text-loam-800">
            {t('plants.provenance.source', { source: sourceLabel(provenance.source) })}
            {provenance.upstreamSource && <> ({t('plants.provenance.via', { source: sourceLabel(provenance.upstreamSource) })})</>}
          </span>
          <span className="mt-1 block">{t(`plants.provenance.statuses.${status}`)}</span>
          {provenance.license && <span className="mt-1 block">{t('plants.provenance.license', { license: provenance.license })}</span>}
          {provenance.updatedAt && <span className="mt-1 block text-loam-400">{t('plants.provenance.updated', { date: formatDate(provenance.updatedAt) })}</span>}
          {provenance.url && (
            <a href={provenance.url} target="_blank" rel="noreferrer noopener" className="mt-1 block text-prune-600 underline">
              {t('plants.provenance.open')}
            </a>
          )}
        </span>
      )}
    </span>
  )
}
