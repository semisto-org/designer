import { Link } from '@inertiajs/react'
import { useState } from 'react'
import { buttonClass } from '@/components/ui/Button'
import { formatArea, t } from '@/lib/i18n'
import { relativeTime } from '@/lib/relativeTime'
import type { ResumeStep } from '@/types/myMaps'
import type { ListedMap } from '@/types/teams'
import { PaletteStrip } from './PaletteStrip'
import { StagePath } from './StagePath'
import { TerrainSketch } from './TerrainSketch'

function nextStepText(next: ResumeStep) {
  if (next.type === 'item') return t('my_maps.resume.next', { step: t(`journey.items.${next.item}.label`) })
  if (next.type === 'advance') return t('my_maps.resume.advance', { stage: t(`maps.stages.${next.stage}`) })
  return t('my_maps.resume.complete')
}

/** The map worked on last, open as a full notebook page with its next step. */
export function ResumeCard({ map, next }: { map: ListedMap; next: ResumeStep }) {
  const [grown, setGrown] = useState(false)
  return (
    <Link
      href={`/maps/${map.id}`}
      onMouseEnter={() => setGrown(true)}
      onMouseLeave={() => setGrown(false)}
      onFocus={() => setGrown(true)}
      onBlur={() => setGrown(false)}
      className="mt-7 grid overflow-hidden rounded-2xl border border-loam-200 bg-[#fffdf7] shadow-[0_1px_0_var(--color-loam-200),0_18px_40px_-28px_rgba(60,50,30,.45)] focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-prune-600 md:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]"
    >
      <TerrainSketch map={map} grown={grown} className="block aspect-[4/3] w-full md:aspect-auto md:h-full md:min-h-[300px]" />
      <div className="flex min-w-0 flex-col gap-3.5 border-t border-dashed border-loam-200 p-5 md:border-t-0 md:border-l md:px-7 md:py-7">
        <p className="text-[11px] tracking-[0.08em] text-loam-500 uppercase">{t('my_maps.resume.eyebrow', { when: relativeTime(map.updatedAt) })}</p>
        <div>
          <h2 className="font-serif text-3xl leading-tight">{map.name}</h2>
          {map.areaM2 != null && <p className="text-sm text-loam-500">{formatArea(map.areaM2)}</p>}
        </div>
        <StagePath stage={map.stage} />
        <p className="font-hand text-[1.4rem] leading-tight text-loam-800">
          <span className="bg-[linear-gradient(transparent_62%,rgba(239,155,13,.22)_62%)] box-decoration-clone px-0.5">{nextStepText(next)}</span>
        </p>
        <PaletteStrip map={map} legend />
        <span className={buttonClass('primary', 'md', 'mt-auto self-start')}>{t('my_maps.resume.open')}</span>
      </div>
    </Link>
  )
}
