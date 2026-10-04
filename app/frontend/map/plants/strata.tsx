import type { Strata } from '@/types/plants'

/** One color per strata, from the design tokens (crowns, dots, balance). */
export const STRATA_COLORS: Record<Strata, string> = {
  canopy: '#1e3f22',
  sub_canopy: '#3d7d42',
  shrub: '#6e835f',
  herbaceous: '#b8851a',
  ground_cover: '#d9a527',
  vine: '#726b9f',
  root: '#946614',
  aquatic: '#2b7bb9',
}

export function StrataDot({ strata, className = '' }: { strata: Strata; className?: string }) {
  return <span className={'inline-block h-2.5 w-2.5 shrink-0 rounded-full ' + className} style={{ background: STRATA_COLORS[strata] }} aria-hidden />
}
