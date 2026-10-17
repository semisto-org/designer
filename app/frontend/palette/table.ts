// The « Palette végétale » table, without React: what a view does to the
// rows (filter, scope to a tag, group, sort), the computed columns and the
// CSV. The page (pages/maps/plant_palettes/show.tsx) draws the result; the
// server sends the rows (PlantPalette) and the built-in views
// (config/plant_palette.yml).

/** Filter value meaning « plants without any tag » (same as map/tags/tags.ts). */
export const UNTAGGED = '\u0000untagged'

import type { FitExclusion, FitTier, PlantFit } from '@/types/plants'

export const FIT_TIERS: FitTier[] = ['fits', 'unknowns', 'one_misfit', 'misfits']

export type PlantStatus = 'existing' | 'chosen' | 'planned' | 'planting' | 'planted'
export const STATUSES: PlantStatus[] = ['existing', 'chosen', 'planned', 'planting', 'planted']

export type TagSlot = { existing: number; planned: number; planted: number; placed: number; patches: number }

export type PaletteRow = {
  key: string
  speciesId: number | null
  varietyId: number | null
  slug?: string
  paletteItemId: number | null
  inPalette: boolean
  name: string
  commonName: string | null
  latinName: string | null
  varietyName: string | null
  strata: string
  plantType: string | null
  role?: string | null
  notes?: string | null
  targetCount?: number | null
  unitPrice?: number | null
  supplier?: string | null
  size?: string | null
  existing: number
  planned: number
  isolated: number
  composed: number
  placed: number
  planted: number
  patches: number
  heightM?: number | null
  spreadM?: number | null
  maturityYears?: number | null
  hardinessZone?: number | null
  exposures: string[]
  edibleRating?: number | null
  floweringMonths: number[]
  harvestMonths: number[]
  native?: boolean | null
  fit?: PlantFit
  excludedBy?: FitExclusion | null
  photo?: string | null
  tags: string[]
  plantedFrom?: string | null
  plantedTo?: string | null
  survival: { established: number; struggling: number; dead: number }
  byTag: Record<string, TagSlot>
  untagged: TagSlot
}

export type Filters = {
  statuses: string[]
  strata: string[]
  roles: string[]
  tag: string | null
  untagged: boolean
  supplier: string | null
  search: string | null
  to_plant_only: boolean
}

export type ViewSettings = {
  columns: string[]
  group_by: string
  sort: { key: string; dir: 'asc' | 'desc' }
  filters: Filters
}

export const STRATA_ORDER = ['canopy', 'sub_canopy', 'shrub', 'herbaceous', 'ground_cover', 'vine', 'root', 'aquatic']

const lower = (s: string) => s.toLocaleLowerCase('fr')
const fold = (s: string) => lower(s.normalize('NFD').replace(/[̀-ͯ]/g, ''))

export const toPlant = (row: PaletteRow) => Math.max(0, row.planned - row.planted)

export function statusOf(row: Pick<PaletteRow, 'existing' | 'planned' | 'planted'>): PlantStatus {
  if (row.planned === 0) return row.existing > 0 ? 'existing' : 'chosen'
  if (row.planted === 0) return 'planned'
  return row.planted < row.planned ? 'planting' : 'planted'
}

export function survivalRate(row: PaletteRow): number | null {
  const { established, struggling, dead } = row.survival
  const observed = established + struggling + dead
  return observed === 0 ? null : Math.round(((established + struggling) * 100) / observed)
}

/** The tag a view looks at: a tag's spelling, UNTAGGED, or null. */
export function scopeOf(filters: Filters): string | null {
  return filters.untagged ? UNTAGGED : filters.tag
}

function slotFor(row: PaletteRow, tag: string): TagSlot | null {
  if (tag === UNTAGGED) return row.untagged
  const wanted = lower(tag)
  const found = Object.entries(row.byTag).find(([name]) => lower(name) === wanted)
  return found ? found[1] : null
}

/** The row as if the palette held only the plants carrying `tag`, or null if it holds none. */
export function scopeRow(row: PaletteRow, tag: string): PaletteRow | null {
  const slot = slotFor(row, tag)
  if (!slot || slot.existing + slot.planned + slot.placed === 0) return null
  return { ...row, existing: slot.existing, planned: slot.planned, planted: slot.planted, placed: slot.placed, patches: slot.patches }
}

/** Raw value of a column, for sorting, totals and the CSV. */
export function cellValue(row: PaletteRow, column: string): string | number | boolean | null {
  switch (column) {
    case 'name': return row.name
    case 'latin_name': return row.latinName
    case 'strata': return row.strata
    case 'plant_type': return row.plantType
    case 'role': return row.role ?? null
    case 'status': return statusOf(row)
    case 'tags': return row.tags.join(', ') || null
    case 'existing': return row.existing
    case 'target': return row.targetCount ?? null
    case 'planned': return row.planned
    case 'planted': return row.planted
    case 'to_plant': return toPlant(row)
    case 'patches': return row.patches
    case 'height': return row.heightM ?? null
    case 'spread': return row.spreadM ?? null
    case 'hardiness': return row.hardinessZone ?? null
    case 'exposures': return row.exposures.join(', ') || null
    case 'edible': return row.edibleRating ?? null
    case 'flowering': return row.floweringMonths.join(', ') || null
    case 'harvest': return row.harvestMonths.join(', ') || null
    case 'native': return row.native ?? null
    // Sorts from what suits best to what suits least.
    case 'fit': return row.fit ? FIT_TIERS.indexOf(row.excludedBy ? 'misfits' : row.fit.tier) : null
    case 'size': return row.size ?? null
    case 'supplier': return row.supplier ?? null
    case 'unit_price': return row.unitPrice ?? null
    case 'amount': return row.unitPrice == null ? null : round2(row.planned * row.unitPrice)
    case 'amount_to_plant': return row.unitPrice == null ? null : round2(toPlant(row) * row.unitPrice)
    case 'planted_dates': return row.plantedFrom ?? null
    case 'established': return row.survival.established
    case 'struggling': return row.survival.struggling
    case 'dead': return row.survival.dead
    case 'survival_rate': return survivalRate(row)
    case 'notes': return row.notes ?? null
    default: return null
  }
}

const round2 = (n: number) => Math.round(n * 100) / 100

/** Columns whose values add up in a group's or the table's total. */
export const SUMMED = new Set(['existing', 'target', 'planned', 'planted', 'to_plant', 'patches', 'amount', 'amount_to_plant', 'established', 'struggling', 'dead'])

export function totals(rows: PaletteRow[], columns: string[]): Record<string, number> {
  const sums: Record<string, number> = {}
  for (const column of columns) {
    if (!SUMMED.has(column)) continue
    sums[column] = round2(rows.reduce((sum, row) => sum + (Number(cellValue(row, column)) || 0), 0))
  }
  return sums
}

export function applyFilters(rows: PaletteRow[], filters: Filters): PaletteRow[] {
  const scope = scopeOf(filters)
  const search = filters.search ? fold(filters.search) : null
  const supplier = filters.supplier ? lower(filters.supplier) : null
  return rows.flatMap((original) => {
    const row = scope ? scopeRow(original, scope) : original
    if (!row) return []
    if (filters.statuses.length && !filters.statuses.includes(statusOf(row))) return []
    if (filters.strata.length && !filters.strata.includes(row.strata)) return []
    if (filters.roles.length && !filters.roles.includes(row.role ?? '')) return []
    if (supplier && lower(row.supplier ?? '') !== supplier) return []
    if (filters.to_plant_only && toPlant(row) === 0) return []
    if (search) {
      const haystack = fold([row.name, row.latinName, row.commonName, row.varietyName, row.supplier, row.notes].filter(Boolean).join(' '))
      if (!haystack.includes(search)) return []
    }
    return [row]
  })
}

function compare(a: string | number | boolean | null, b: string | number | boolean | null): number {
  if (a == null && b == null) return 0
  if (a == null) return 1
  if (b == null) return -1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return fold(String(a)).localeCompare(fold(String(b)), 'fr')
}

export function sortRows(rows: PaletteRow[], sort: ViewSettings['sort']): PaletteRow[] {
  const dir = sort.dir === 'desc' ? -1 : 1
  const rank = (row: PaletteRow, key: string) =>
    key === 'strata' ? STRATA_ORDER.indexOf(row.strata) : key === 'status' ? STATUSES.indexOf(statusOf(row)) : cellValue(row, key)
  return [...rows].sort((a, b) => {
    const va = rank(a, sort.key)
    const vb = rank(b, sort.key)
    // Empty cells stay at the bottom whatever the direction.
    if (va == null || vb == null) return compare(va, vb)
    return compare(va, vb) * dir || compare(a.name, b.name)
  })
}

export type Group = { key: string | null; rows: PaletteRow[] }

/**
 * Groups in a stable, meaningful order: strata from the canopy down,
 * statuses along the project's time, the rest alphabetically with the empty
 * group last. By tag, a plant carrying two tags appears in both groups, each
 * time with that tag's quantities (as the plant list grouped by tag).
 */
export function groupRows(rows: PaletteRow[], groupBy: string, tags: string[]): Group[] {
  if (groupBy === 'none') return [{ key: null, rows }]
  if (groupBy === 'tag') {
    const groups: Group[] = tags.map((tag) => ({ key: tag, rows: rows.flatMap((row) => scopeRow(row, tag) ?? []) }))
    groups.push({ key: null, rows: rows.flatMap((row) => scopeRow(row, UNTAGGED) ?? []) })
    return groups.filter((g) => g.rows.length)
  }
  const keyOf = (row: PaletteRow): string | null => {
    switch (groupBy) {
      case 'strata': return row.strata
      case 'status': return statusOf(row)
      case 'role': return row.role ?? null
      case 'supplier': return row.supplier ?? null
      case 'plant_type': return row.plantType ?? null
      default: return null
    }
  }
  const buckets = new Map<string | null, PaletteRow[]>()
  for (const row of rows) {
    const key = keyOf(row)
    const label = groupBy === 'supplier' && key ? [...buckets.keys()].find((k) => k != null && lower(k) === lower(key)) ?? key : key
    buckets.set(label, [...(buckets.get(label) ?? []), row])
  }
  const order = groupBy === 'strata' ? STRATA_ORDER : groupBy === 'status' ? STATUSES : null
  return [...buckets.entries()]
    .map(([key, list]) => ({ key, rows: list }))
    .sort((a, b) => {
      if (a.key == null) return 1
      if (b.key == null) return -1
      if (order) return order.indexOf(a.key) - order.indexOf(b.key)
      return compare(a.key, b.key)
    })
}

/** The whole pipeline of a view. */
export function viewGroups(rows: PaletteRow[], settings: ViewSettings, tags: string[]): Group[] {
  const filtered = sortRows(applyFilters(rows, settings.filters), settings.sort)
  return groupRows(filtered, settings.group_by, tags)
}

export function activeFilterCount(filters: Filters): number {
  return filters.statuses.length + filters.strata.length + filters.roles.length +
    (filters.tag || filters.untagged ? 1 : 0) + (filters.supplier ? 1 : 0) + (filters.to_plant_only ? 1 : 0)
}

export function sameSettings(a: ViewSettings, b: ViewSettings): boolean {
  return JSON.stringify(normalizeSettings(a)) === JSON.stringify(normalizeSettings(b))
}

/** Same shape whatever came from the server or the page (missing keys filled). */
export function normalizeSettings(s: Omit<Partial<ViewSettings>, 'filters'> & { filters?: Partial<Filters> }): ViewSettings {
  const f: Partial<Filters> = s.filters ?? {}
  const columns = (s.columns ?? []).filter((c) => c !== 'name')
  return {
    columns: ['name', ...columns],
    group_by: s.group_by ?? 'none',
    sort: { key: s.sort?.key ?? 'name', dir: s.sort?.dir === 'desc' ? 'desc' : 'asc' },
    filters: {
      statuses: f.statuses ?? [], strata: f.strata ?? [], roles: f.roles ?? [],
      tag: f.tag ?? null, untagged: f.untagged ?? false, supplier: f.supplier ?? null,
      search: f.search ?? null, to_plant_only: f.to_plant_only ?? false,
    },
  }
}

/** Semicolon-separated with a BOM, decimals with a comma: opens as columns in a French Excel. */
export function toCsv(groups: Group[], columns: string[], header: (column: string) => string, display: (row: PaletteRow, column: string) => string): string {
  const escape = (value: string) => (/[";\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value)
  const lines = [columns.map((c) => escape(header(c))).join(';')]
  for (const group of groups) {
    for (const row of group.rows) lines.push(columns.map((c) => escape(display(row, c))).join(';'))
  }
  return '﻿' + lines.join('\r\n') + '\r\n'
}

/** Years the « time » strip looks at: the first summer, then 5, 15 and 30 years on. */
export const GROWTH_YEARS = [1, 5, 15, 30]
const WOODY = new Set(['canopy', 'sub_canopy', 'shrub'])
// Size when planted (m), as in the 3D view (relief/growth.ts).
const PLANTING_SPREAD: Record<string, number> = { canopy: 0.6, sub_canopy: 0.5, shrub: 0.3 }

/** Same curve as the 3D view: slow start, fast, then levelling off (Chapman-Richards). */
function growthShare(age: number, maturityYears: number): number {
  if (age <= 0) return 0
  const maturity = Math.max(1, maturityYears)
  return Math.min(1, Math.pow(1 - Math.exp((-3 * age) / maturity), 1.3) / 0.93)
}

/**
 * Crowns of the trees and shrubs, added up (m²), `years` after planting:
 * existing trees at their size, planned ones growing toward their adult
 * spread. Layers overlap in a forest garden, so it can pass the land's area.
 */
export function crownArea(rows: PaletteRow[], years: number): number {
  let area = 0
  for (const row of rows) {
    if (!WOODY.has(row.strata) || !row.spreadM) continue
    const disc = (spread: number) => Math.PI * (spread / 2) ** 2
    area += row.existing * disc(row.spreadM)
    const start = Math.min(PLANTING_SPREAD[row.strata] ?? 0.3, row.spreadM)
    const spread = start + (row.spreadM - start) * growthShare(years, row.maturityYears ?? 10)
    area += row.planned * disc(spread)
  }
  return Math.round(area)
}
