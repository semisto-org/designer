import clsx from 'clsx'
import { Pencil, Plus, Sun } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select, Textarea } from '@/components/ui/Field'
import { t } from '@/lib/i18n'
import { useEditor } from '@/map/editor/EditorContext'
import { rangeText } from '@/map/sectors/labels'
import {
  arcPath, arcRadius, COMPASS_POINTS, isSectorType, SECTOR_COLORS, SECTOR_TYPES, sectorArc, sectorRange, sunSectors,
  type SectorType,
} from '@/map/sectors/sectors'
import type { MapFeature } from '@/types'
import type { LineString } from 'geojson'

type Draft = { id: number | null; type: SectorType; from: number | null; to: number | null; name: string; notes: string }

const EMPTY: Draft = { id: null, type: 'wind', from: null, to: null, name: '', notes: '' }

export const isSector = (f: MapFeature) => f.properties.kind === 'sector' && f.geometry.type === 'LineString'

/**
 * The 16 compass points around a circle: a first click sets where the sector
 * starts, a second where it ends (clockwise), and the arc between them shows.
 */
function Compass({ from, to, color, onPick }: { from: number | null; to: number | null; color: string; onPick: (deg: number) => void }) {
  const size = 220
  const c = size / 2
  const r = 78
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="mx-auto block w-full max-w-[15rem]" role="group" aria-label={t('sectors.compass')}>
      <circle cx={c} cy={c} r={r} fill="none" stroke="#d9d1c3" strokeWidth={14} />
      {from != null && to != null && (
        <path d={arcPath(c, c, r, from, to)} fill="none" stroke={color} strokeWidth={14} strokeLinecap="round" />
      )}
      <circle cx={c} cy={c} r={30} fill="#f6f1e7" stroke="#d9d1c3" />
      <text x={c} y={c + 5} textAnchor="middle" className="fill-loam-600 text-[13px]">{t('sectors.terrain')}</text>
      {COMPASS_POINTS.map((point, i) => {
        const deg = i * 22.5
        const rad = (deg * Math.PI) / 180
        const x = c + (r + 0) * Math.sin(rad)
        const y = c - (r + 0) * Math.cos(rad)
        const lx = c + (r + 24) * Math.sin(rad)
        const ly = c - (r + 24) * Math.cos(rad)
        const chosen = deg === from || deg === to
        const major = i % 2 === 0
        return (
          <g key={point}>
            <circle
              cx={x}
              cy={y}
              r={chosen ? 8 : 6}
              fill={chosen ? '#1b1712' : '#ffffff'}
              stroke="#1b1712"
              strokeWidth={1}
              className="cursor-pointer"
              role="button"
              aria-label={point}
              tabIndex={0}
              onClick={() => onPick(deg)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(deg) } }}
            />
            <text x={lx} y={ly + 4} textAnchor="middle" className={clsx(major ? 'fill-loam-800 text-[13px] font-semibold' : 'fill-loam-500 text-[10px]')}>
              {point}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

/**
 * « Secteurs »: what comes onto the terrain from outside, direction by
 * direction (winds, fire, noise, views, wildlife, flooding…), drawn as arcs
 * around it. The summer and winter sun come from the latitude. The page
 * « Analyse des secteurs » of the project dossier draws them all.
 */
export default function SectorsPanel() {
  const editor = useEditor()
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)
  const center = editor.map.center ?? (editor.instance.getCenter().toArray() as [number, number])
  const sectors = editor.features.filter((f) => isSector(f) && f.properties.status === 'active')
  const sun = useMemo(() => sunSectors(center[1]), [center[1]]) // eslint-disable-line react-hooks/exhaustive-deps

  const pick = (deg: number) => setDraft((d) => {
    if (!d) return d
    // A third click starts again.
    if (d.from == null || d.to != null) return { ...d, from: deg, to: null }
    return deg === d.from ? d : { ...d, to: deg }
  })

  function edit(feature: MapFeature) {
    const range = sectorRange(feature.geometry as LineString, center)
    const type = feature.properties.sector_type
    setDraft({
      id: feature.properties.id,
      type: isSectorType(type) ? type : 'other',
      from: range?.from ?? null,
      to: range?.to ?? null,
      name: feature.properties.name ?? '',
      notes: feature.properties.notes ?? '',
    })
    editor.select(feature.properties.id)
  }

  async function save() {
    if (!draft || draft.from == null || draft.to == null) return
    setSaving(true)
    const fields = {
      geometry: sectorArc(center, arcRadius(editor.map.bbox), draft.from, draft.to),
      name: draft.name.trim() || null,
      notes: draft.notes.trim() || null,
      properties: { sector_type: draft.type },
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

  const ready = draft != null && draft.from != null && draft.to != null

  return (
    <div className="space-y-4">
      <p className="text-sm text-loam-600">{t('sectors.intro')}</p>

      <ul className="space-y-1">
        {sun.map((s) => (
          <li key={s.type} className="flex items-center gap-2 rounded-md px-1.5 py-1 text-sm">
            <span className="h-2.5 w-6 rounded-full" style={{ background: SECTOR_COLORS[s.type] }} aria-hidden />
            <Sun className="h-3.5 w-3.5 text-humus-600" aria-hidden />
            <span className="font-medium text-loam-900">{t(`sectors.sun.${s.type}`)}</span>
            <span className="ml-auto text-loam-500">{rangeText(s.from, s.to)}</span>
          </li>
        ))}
        {sectors.map((f) => {
          const range = sectorRange(f.geometry as LineString, center)
          const type = isSectorType(f.properties.sector_type) ? f.properties.sector_type : 'other'
          return (
            <li key={f.properties.id}>
              <button
                type="button"
                onClick={() => edit(f)}
                className={clsx('flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-sm hover:bg-loam-50', draft?.id === f.properties.id && 'bg-loam-100')}
              >
                <span className="h-2.5 w-6 shrink-0 rounded-full" style={{ background: f.properties.style?.color as string ?? SECTOR_COLORS[type] }} aria-hidden />
                <span className="truncate font-medium text-loam-900">{f.properties.name || t(`drawing.options.sector_type.${type}`)}</span>
                {range && <span className="ml-auto shrink-0 text-loam-500">{rangeText(range.from, range.to)}</span>}
                {editor.canEdit && <Pencil className="h-3.5 w-3.5 shrink-0 text-loam-400" aria-hidden />}
              </button>
            </li>
          )
        })}
      </ul>
      {sectors.length === 0 && <p className="text-sm text-loam-500">{t('sectors.empty')}</p>}

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
          <div>
            <p className="text-sm font-medium text-loam-700">{t('sectors.directions')}</p>
            <p className="text-sm text-loam-500">
              {draft.from == null ? t('sectors.pick_from') : draft.to == null ? t('sectors.pick_to') : rangeText(draft.from, draft.to)}
            </p>
            <Compass from={draft.from} to={draft.to} color={SECTOR_COLORS[draft.type]} onPick={pick} />
          </div>
          <Field label={t('sectors.name')} hint={t('sectors.name_hint')}>
            <Input value={draft.name} maxLength={60} placeholder={t(`drawing.options.sector_type.${draft.type}`)} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </Field>
          <Field label={t('sectors.notes')} hint={t('sectors.notes_hint')}>
            <Textarea rows={3} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
          </Field>
          <div className="flex gap-2">
            <Button size="sm" disabled={!ready || saving} onClick={() => void save()}>{t(draft.id ? 'sectors.save' : 'sectors.create')}</Button>
            <Button size="sm" variant="ghost" onClick={() => setDraft(null)}>{t('sectors.cancel')}</Button>
          </div>
        </div>
      )}
    </div>
  )
}
