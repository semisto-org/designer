import type { SoilBand, SoilResultKey } from '@/types/soil_photos'

const valueFormat = new Intl.NumberFormat('fr-BE', { maximumFractionDigits: 2 })
const dayFormat = new Intl.DateTimeFormat('fr-BE', { day: 'numeric', month: 'long', year: 'numeric' })

/** 6.25 -> « 6,25 », 12 -> « 12 ». */
export const formatValue = (value: number): string => valueFormat.format(value)

/** « 2026-05-17 » -> « 17 mai 2026 » (a calendar date: no time zone shifts it). */
export function formatDate(iso: string | null): string {
  if (!iso) return ''
  const [year, month, day] = iso.slice(0, 10).split('-').map(Number)
  return dayFormat.format(new Date(year, month - 1, day))
}

/** Today as « YYYY-MM-DD », in the browser's calendar. */
export function today(): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/** The order the lab figures are entered and compared in, with their group. */
export const RESULT_GROUPS: { id: 'acidity' | 'organic' | 'minerals' | 'texture'; keys: SoilResultKey[] }[] = [
  { id: 'acidity', keys: ['ph_water', 'ph_kcl'] },
  { id: 'organic', keys: ['organic_matter_pct', 'c_n_ratio'] },
  { id: 'minerals', keys: ['p_mg_100g', 'k_mg_100g', 'mg_mg_100g', 'ca_mg_100g', 'cec_meq_100g'] },
  { id: 'texture', keys: ['sand_pct', 'silt_pct', 'clay_pct'] },
]

/** Colours of a band. Amber for low, green for ok, plum for high: none of them means « bad ». */
export const BAND_STYLE: Record<SoilBand, { chip: string; cell: string }> = {
  low: { chip: 'bg-humus-100 text-humus-700', cell: 'bg-humus-50 text-humus-700' },
  ok: { chip: 'bg-leaf-100 text-leaf-800', cell: 'bg-leaf-50 text-leaf-800' },
  high: { chip: 'bg-prune-100 text-prune-800', cell: 'bg-prune-50 text-prune-800' },
}
