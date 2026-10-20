import clsx from 'clsx'
import { ArrowLeftRight, Bot, Circle, Pencil, Plus, Sun, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select, Textarea } from '@/components/ui/Field'
import { t } from '@/lib/i18n'
import { useEditor } from '@/map/editor/EditorContext'
import { rangeText } from '@/map/sectors/labels'
import { hideSectorOverlay, overlayBounds, showSectorOverlay, type OverlayArc } from '@/map/sectors/overlay'
import {
  allAround, arcPath, arcRadius, COMPASS_POINTS, isSectorSeason, isSectorType, SECTOR_COLORS, SECTOR_SEASONS, SECTOR_TYPES, sectorArc,
  sectorDirections, shorterWay, showsIn, sunSectors,
  type SectorSeason, type SectorType,
} from '@/map/sectors/sectors'
import type { MapFeature } from '@/types'
import type { LineString } from 'geojson'

type Draft = { id: number | null; type: SectorType; season: SectorSeason; from: number | null; to: number | null; name: string; notes: string }
type SeasonFilter = 'all' | 'winter' | 'summer'

const EMPTY: Draft = { id: null, type: 'wind', season: 'all_year', from: null, to: null, name: '', notes: '' }

export const isSector = (f: MapFeature) => f.properties.kind === 'sector' && f.geometry.type === 'LineString'

const pointName = (i: number) => t(`sectors.points.${COMPASS_POINTS[i].toLowerCase()}`)

/**
 * The 16 compass points around a circle: a first touch sets one end of the
 * sector, a second the other, and the shorter arc between them shows. Each
 * point answers on its whole slice of the ring (a finger finds it), and
 * the arrow keys walk around the ring.
 */
function Compass({ from, to, color, onPick }: { from: number | null; to: number | null; color: string; onPick: (deg: number) => void }) {
  const size = 240
  const c = size / 2
  const r = 80
  const [focus, setFocus] = useState(0)
  const slices = useRef<(SVGPathElement | null)[]>([])
  const slice = (deg: number) => {
    const inner = r - 28
    const outer = r + 38
    const at = (d: number, radius: number) => `${(c + radius * Math.sin((d * Math.PI) / 180)).toFixed(2)} ${(c - radius * Math.cos((d * Math.PI) / 180)).toFixed(2)}`
    return `M ${at(deg - 11.25, inner)} L ${at(deg - 11.25, outer)} A ${outer} ${outer} 0 0 1 ${at(deg + 11.25, outer)} L ${at(deg + 11.25, inner)} A ${inner} ${inner} 0 0 0 ${at(deg - 11.25, inner)} Z`
  }
  function onKeyDown(e: KeyboardEvent, i: number) {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
    if (step) {
      e.preventDefault()
      const next = (i + step + 16) % 16
      setFocus(next)
      slices.current[next]?.focus()
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onPick(i * 22.5)
    }
  }
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="mx-auto block w-full max-w-[16rem] touch-manipulation" role="radiogroup" aria-label={t('sectors.compass')}>
      <circle cx={c} cy={c} r={r} fill="none" stroke="#d9d1c3" strokeWidth={14} />
      {from != null && to != null && (
        <path d={arcPath(c, c, r, from, to)} fill="none" stroke={color} strokeWidth={14} strokeLinecap="round" />
      )}
      <circle cx={c} cy={c} r={32} fill="#f6f1e7" stroke="#d9d1c3" />
      <text x={c} y={c + 5} textAnchor="middle" className="fill-loam-600 text-[14px]">{t('sectors.terrain')}</text>
      {COMPASS_POINTS.map((point, i) => {
        const deg = i * 22.5
        const rad = (deg * Math.PI) / 180
        const chosen = deg === from || deg === to
        const major = i % 2 === 0
        return (
          <g key={point}>
            <circle
              cx={c + r * Math.sin(rad)}
              cy={c - r * Math.cos(rad)}
              r={chosen ? 9 : 6.5}
              fill={chosen ? '#1b1712' : '#ffffff'}
              stroke="#1b1712"
              strokeWidth={1}
              pointerEvents="none"
            />
            <text
              x={c + (r + 25) * Math.sin(rad)}
              y={c - (r + 25) * Math.cos(rad) + 5}
              textAnchor="middle"
              pointerEvents="none"
              className={clsx(major ? 'fill-loam-800 text-[14px] font-semibold' : 'fill-loam-500 text-[11px]')}
            >
              {point}
            </text>
            <path
              ref={(el) => { slices.current[i] = el }}
              d={slice(deg)}
              fill="transparent"
              className="cursor-pointer outline-none focus-visible:fill-prune-600/10 hover:fill-loam-900/5"
              role="radio"
              aria-checked={chosen}
              aria-label={pointName(i)}
              tabIndex={i === focus ? 0 : -1}
              onClick={() => { setFocus(i); onPick(deg) }}
              onKeyDown={(e) => onKeyDown(e, i)}
            />
          </g>
        )
      })}
    </svg>
  )
}

/**
 * « Secteurs »: what comes onto the terrain from outside, direction by
 * direction (winds, fire, noise, views, wildlife, flooding…), drawn as arcs
 * around it. The summer and winter sun come from the latitude. While the
 * panel is open, the map shows every arc on its own ring, like the page
 * « Analyse des secteurs » of the project dossier.
 */
export default function SectorsPanel() {
  const editor = useEditor()
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)
  const [season, setSeason] = useState<SeasonFilter>('all')
  const center = editor.map.center ?? (editor.instance.getCenter().toArray() as [number, number])
  const all = editor.features.filter((f) => isSector(f) && (f.properties.status === 'active' || f.properties.status === 'draft'))
  const sectorSeason = (f: MapFeature) => (isSectorSeason(f.properties.sector_season) ? f.properties.sector_season : 'all_year')
  const sectors = all.filter((f) => showsIn(sectorSeason(f), season))
  const sun = useMemo(() => sunSectors(center[1]), [center[1]]) // eslint-disable-line react-hooks/exhaustive-deps
  const shownSun = sun.filter((s) => season === 'all' || s.type === `${season}_sun`)

  // The overlay: every arc on its own ring around the terrain, the one being edited included.
  const arcs: OverlayArc[] = [
    ...shownSun.map((s) => ({ key: s.type, from: s.from, to: s.to, color: SECTOR_COLORS[s.type], label: t(`sectors.sun.${s.type}`), draft: false })),
    ...sectors.flatMap((f): OverlayArc[] => {
      if (draft?.id === f.properties.id) return []
      const range = sectorDirections(f.properties, f.geometry as LineString, center)
      const type = isSectorType(f.properties.sector_type) ? f.properties.sector_type : 'other'
      return range ? [{ key: String(f.properties.id), ...range, color: SECTOR_COLORS[type], label: f.properties.name || t(`drawing.options.sector_type.${type}`), draft: f.properties.status === 'draft' }] : []
    }),
    ...(draft && draft.from != null && draft.to != null
      ? [{ key: 'editing', from: draft.from, to: draft.to, color: SECTOR_COLORS[draft.type], label: draft.name || t(`drawing.options.sector_type.${draft.type}`), draft: false }]
      : []),
  ]
  const arcsKey = JSON.stringify(arcs)
  const radius = arcRadius(editor.map.bbox)
  const map = editor.instance
  useEffect(() => {
    const ensure = () => {
      try {
        showSectorOverlay(map, JSON.parse(arcsKey) as OverlayArc[], center, radius)
      } catch {
        /* style not ready yet: the next styledata brings us back */
      }
    }
    ensure()
    map.on('styledata', ensure)
    return () => { map.off('styledata', ensure) }
  }, [map, arcsKey, center[0], center[1], radius]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { try { hideSectorOverlay(map) } catch { /* map already gone */ } }, [map])
  // On opening, step back until every ring is in view, beside the panel: on its
  // right on a computer, above it on a phone, where it rises from the bottom.
  useEffect(() => {
    const [w, s, e, n] = overlayBounds(arcs, center, radius)
    const view = map.getBounds()
    if (view.contains([w, s]) && view.contains([e, n])) return
    const { clientWidth: width, clientHeight: height } = map.getContainer()
    const padding = width < 768
      ? { top: 130, bottom: Math.round(height * 0.55), left: 16, right: 64 }
      : { top: 70, bottom: 150, left: 330, right: 70 }
    map.fitBounds([[w, s], [e, n]], { padding, duration: 600 })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const pick = (deg: number) => setDraft((d) => {
    if (!d) return d
    // A third touch starts again.
    if (d.from == null || d.to != null) return { ...d, from: deg, to: null }
    return deg === d.from ? d : { ...d, ...shorterWay(d.from, deg) }
  })

  // A sector chosen on the map (its inspector's « Modifier ») opens here, ready to edit.
  // An AI's draft is reviewed in the inspector first: it opens here once accepted.
  const selected = editor.selected
  useEffect(() => {
    if (selected && isSector(selected) && selected.properties.status === 'active' && selected.properties.id !== draft?.id) edit(selected)
  }, [selected?.properties.id, selected?.properties.status]) // eslint-disable-line react-hooks/exhaustive-deps

  function edit(feature: MapFeature) {
    const range = sectorDirections(feature.properties, feature.geometry as LineString, center)
    const type = feature.properties.sector_type
    setDraft({
      id: feature.properties.id,
      type: isSectorType(type) ? type : 'other',
      season: sectorSeason(feature),
      from: range?.from ?? null,
      to: range?.to ?? null,
      name: feature.properties.name ?? '',
      notes: feature.properties.notes ?? '',
    })
  }

  async function save() {
    if (!draft || draft.from == null || draft.to == null) return
    setSaving(true)
    const fields = {
      geometry: sectorArc(center, radius, draft.from, draft.to),
      name: draft.name.trim() || null,
      notes: draft.notes.trim() || null,
      // The directions are saved as such: they stay true when the outline, and so the centre, changes.
      properties: { sector_type: draft.type, sector_season: draft.season, from_deg: draft.from, to_deg: draft.to },
      style: { color: SECTOR_COLORS[draft.type] },
    }
    try {
      if (draft.id) await editor.updateFeature(draft.id, fields)
      else await editor.createFeature({ layer: 'notes', kind: 'sector', ...fields })
      setDraft(null)
    } catch {
      editor.notify(t('sectors.save_error'), 'error')
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    if (!draft?.id || !window.confirm(t('sectors.confirm_delete'))) return
    setSaving(true)
    try {
      await editor.deleteFeature(draft.id)
      setDraft(null)
    } catch (e) {
      editor.notify((e as Error).message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const ready = draft != null && draft.from != null && draft.to != null
  const seasons: SeasonFilter[] = ['all', 'winter', 'summer']

  return (
    <div className="space-y-4">
      <p className="text-sm text-loam-600">{t('sectors.intro')}</p>

      <div className="flex gap-1 rounded-full bg-loam-100 p-1" role="radiogroup" aria-label={t('sectors.season_filter')}>
        {seasons.map((s) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={season === s}
            onClick={() => setSeason(s)}
            className={clsx('flex-1 whitespace-nowrap rounded-full px-2 py-1 text-sm', season === s ? 'bg-white font-medium text-loam-900 shadow-sm' : 'text-loam-600 hover:text-loam-900')}
          >
            {t(`sectors.season.${s}`)}
          </button>
        ))}
      </div>

      <ul className="space-y-1">
        {shownSun.map((s) => (
          <li key={s.type} className="flex items-center gap-2 rounded-md px-1.5 py-1 text-sm">
            <span className="h-2.5 w-6 rounded-full" style={{ background: SECTOR_COLORS[s.type] }} aria-hidden />
            <Sun className="h-3.5 w-3.5 text-humus-600" aria-hidden />
            <span className="font-medium text-loam-900">{t(`sectors.sun.${s.type}`)}</span>
            <span className="ml-auto text-loam-500">{rangeText(s.from, s.to)}</span>
          </li>
        ))}
        {sectors.map((f) => {
          const range = sectorDirections(f.properties, f.geometry as LineString, center)
          const type = isSectorType(f.properties.sector_type) ? f.properties.sector_type : 'other'
          const proposed = f.properties.status === 'draft'
          return (
            <li key={f.properties.id}>
              <button
                type="button"
                onClick={() => (proposed ? editor.select(f.properties.id) : edit(f))}
                className={clsx('flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-sm hover:bg-loam-50', (draft?.id ?? editor.selectedId) === f.properties.id && 'bg-loam-100')}
              >
                <span className={clsx('h-2.5 w-6 shrink-0 rounded-full', proposed && 'opacity-60')} style={{ background: SECTOR_COLORS[type] }} aria-hidden />
                <span className="truncate font-medium text-loam-900">{f.properties.name || t(`drawing.options.sector_type.${type}`)}</span>
                {proposed && <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-prune-50 px-2 text-sm text-prune-700"><Bot className="h-3.5 w-3.5" aria-hidden />{t('sectors.proposed')}</span>}
                {range && <span className="ml-auto shrink-0 text-loam-500">{rangeText(range.from, range.to)}</span>}
                {editor.canEdit && !proposed && <Pencil className="h-3.5 w-3.5 shrink-0 text-loam-400" aria-hidden />}
              </button>
            </li>
          )
        })}
      </ul>
      {all.length === 0 && <p className="text-sm text-loam-500">{t('sectors.empty')}</p>}

      {editor.canEdit && !draft && (
        <Button variant="secondary" size="sm" onClick={() => setDraft(EMPTY)}><Plus className="h-4 w-4" />{t('sectors.add')}</Button>
      )}

      {draft && (
        <div className="space-y-3 rounded-xl bg-loam-50 p-3 ring-1 ring-loam-200">
          <Field label={t('drawing.fields.sector_type')}>
            <Select value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value as SectorType })}>
              {SECTOR_TYPES.map((type) => <option key={type} value={type}>{t(`drawing.options.sector_type.${type}`)}</option>)}
            </Select>
          </Field>
          {/* The companion: what to look at on the land to find this sector. */}
          <p className="rounded-lg bg-white px-3 py-2 text-sm text-loam-700 ring-1 ring-loam-200">
            <span className="font-medium text-loam-900">{t('sectors.observe_title')} </span>
            {t(`sectors.observe.${draft.type}`)}
          </p>
          <div>
            <p className="text-sm font-medium text-loam-700">{t('sectors.directions')}</p>
            <p className="text-sm text-loam-500" aria-live="polite">
              {draft.from == null ? t('sectors.pick_from') : draft.to == null ? t('sectors.pick_to') : rangeText(draft.from, draft.to)}
            </p>
            <Compass from={draft.from} to={draft.to} color={SECTOR_COLORS[draft.type]} onPick={pick} />
            <div className="mt-1 flex flex-wrap justify-center gap-2">
              {draft.from != null && draft.to != null && !allAround(draft.from, draft.to) && (
                <Button size="sm" variant="ghost" onClick={() => setDraft({ ...draft, from: draft.to, to: draft.from })}>
                  <ArrowLeftRight className="h-4 w-4" aria-hidden />{t('sectors.other_way')}
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => setDraft({ ...draft, from: 0, to: 0 })}>
                <Circle className="h-4 w-4" aria-hidden />{t('sectors.all_around_button')}
              </Button>
            </div>
          </div>
          <Field label={t('drawing.fields.sector_season')}>
            <Select value={draft.season} onChange={(e) => setDraft({ ...draft, season: e.target.value as SectorSeason })}>
              {SECTOR_SEASONS.map((s) => <option key={s} value={s}>{t(`drawing.options.sector_season.${s}`)}</option>)}
            </Select>
          </Field>
          <Field label={t('sectors.name')} hint={t('sectors.name_hint')}>
            <Input value={draft.name} maxLength={60} placeholder={t(`drawing.options.sector_type.${draft.type}`)} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </Field>
          <Field label={t('sectors.notes')} hint={t('sectors.notes_hint')}>
            <Textarea rows={3} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
          </Field>
          <div className="flex gap-2">
            <Button size="sm" disabled={!ready || saving} onClick={() => void save()}>{t(draft.id ? 'sectors.save' : 'sectors.create')}</Button>
            <Button size="sm" variant="ghost" onClick={() => setDraft(null)}>{t('sectors.cancel')}</Button>
            {draft.id && (
              <Button size="sm" variant="danger-ghost" className="ml-auto" disabled={saving} onClick={() => void remove()}>
                <Trash2 className="h-4 w-4" aria-hidden />{t('sectors.delete')}
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
