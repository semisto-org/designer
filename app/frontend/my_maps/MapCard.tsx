import { Link } from '@inertiajs/react'
import { useState } from 'react'
import { formatArea, t } from '@/lib/i18n'
import { relativeTime } from '@/lib/relativeTime'
import type { ListedMap } from '@/types/teams'
import { PaletteStrip } from './PaletteStrip'
import { StagePath } from './StagePath'
import { TerrainSketch } from './TerrainSketch'

/** A map pinned in the notebook: its terrain sketch, step and palette. */
export function MapCard({ map, showOwner = false, headingLevel = 'h2' }: { map: ListedMap; showOwner?: boolean; headingLevel?: 'h2' | 'h3' }) {
  const [grown, setGrown] = useState(false)
  const Title = headingLevel
  return (
    <Link
      href={`/maps/${map.id}`}
      onMouseEnter={() => setGrown(true)}
      onMouseLeave={() => setGrown(false)}
      onFocus={() => setGrown(true)}
      onBlur={() => setGrown(false)}
      className="flex h-full flex-col overflow-hidden rounded-2xl border border-loam-200 bg-[#fffdf7] shadow-[0_1px_0_var(--color-loam-200)] transition duration-500 ease-out hover:-translate-y-0.5 hover:shadow-[0_16px_30px_-22px_rgba(60,50,30,.55)] focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-prune-600 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
    >
      <TerrainSketch map={map} grown={grown} className="block aspect-[16/10] w-full border-b border-dashed border-loam-200" />
      <div className="flex flex-1 flex-col gap-2.5 px-[18px] pt-3.5 pb-4">
        <Title className="truncate font-serif text-xl leading-tight font-semibold">{map.name}</Title>
        <StagePath stage={map.stage} small />
        <PaletteStrip map={map} />
        <div className="mt-auto flex items-baseline justify-between gap-2 text-xs text-loam-500 tabular-nums">
          <span className="min-w-0 truncate">
            {map.areaM2 != null && <>{formatArea(map.areaM2)} · </>}{t(`maps.roles.${map.role}`)}
            {showOwner && map.role !== 'owner' && <> · {t('teams.maps_index.owner', { name: map.ownerName })}</>}
          </span>
          <span className="shrink-0 font-hand text-base leading-none text-loam-400">{relativeTime(map.updatedAt)}</span>
        </div>
      </div>
    </Link>
  )
}

/** Three sketches a row on a wide screen, two on a tablet, one on a phone. */
export function MapCardGrid({ maps, showOwner = false, headingLevel }: { maps: ListedMap[]; showOwner?: boolean; headingLevel?: 'h2' | 'h3' }) {
  if (maps.length === 0) return null
  return (
    <ul className="mt-5 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {maps.map((map) => (
        <li key={map.id}>
          <MapCard map={map} showOwner={showOwner} headingLevel={headingLevel} />
        </li>
      ))}
    </ul>
  )
}
