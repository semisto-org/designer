import { area as turfArea } from '@turf/turf'
import clsx from 'clsx'
import { Bot, Footprints, House, LocateFixed, PenLine, Sparkles, TriangleAlert } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { LineString, MultiPolygon, Polygon } from 'geojson'
import { Button } from '@/components/ui/Button'
import { Field, Select } from '@/components/ui/Field'
import { t } from '@/lib/i18n'
import { storedProperties } from '@/map/drawing/catalog'
import { saveFeature } from '@/map/drawing/save'
import { useEditor, type Editor } from '@/map/editor/EditorContext'
import { rangeText } from '@/map/sectors/labels'
import { hideSectorOverlay, overlayBounds, showSectorOverlay, type OverlayArc } from '@/map/sectors/overlay'
import { arcRadius, isSectorType, SECTOR_COLORS, sectorDirections, sunSectors } from '@/map/sectors/sectors'
import { hideZonesOverlay, showZonesOverlay, type OverlayZone } from '@/map/zones/overlay'
import {
  anchorOf, isDwelling, isPermacultureZone, PERMACULTURE_ZONE_COLORS, PERMACULTURE_ZONE_KIND, proposeZones, zoneAdvice, zoneNumberOf, ZONE_NUMBERS,
  type ProposedZone, type ZoneAdvice, type ZoneNumber,
} from '@/map/zones/permaculture'
import { zoneAreaText } from '@/map/zones/zones'
import type { MapFeature } from '@/types'

const PATH_KINDS = ['path', 'track', 'path_existing']

const live = (f: MapFeature) => f.properties.status === 'active'

export const zoneLabel = (n: ZoneNumber) => t('permaculture_zones.zone', { number: n })

/** The sentence the companion says for one piece of advice. */
export function adviceText(advice: ZoneAdvice): string {
  switch (advice.kind) {
    case 'placement':
      return t(`permaculture_zones.advice.${advice.tooFar ? 'placement_far' : 'placement_near'}`, {
        element: advice.name || t(`editor.kinds.${advice.elementKind}`),
        zone: advice.zone,
        frequency: t(`permaculture_zones.frequency.${advice.zone}`),
        why: t(`permaculture_zones.why.${advice.elementKind}`),
      })
    case 'no_wild':
      return t('permaculture_zones.advice.no_wild')
    case 'no_house':
      return t('permaculture_zones.advice.no_house')
    case 'wind_unsheltered':
      return t(`permaculture_zones.advice.${advice.cold ? 'cold_wind_unsheltered' : 'wind_unsheltered'}`, { range: rangeText(advice.from, advice.to) })
    case 'fire_side':
      return t('permaculture_zones.advice.fire_side', { range: rangeText(advice.from, advice.to) })
  }
}

/** The sectors drawn on the terrain, with their directions, for the zones × sectors view and advice. */
export function sectorRanges(editor: Editor) {
  const center = editor.map.center ?? (editor.instance.getCenter().toArray() as [number, number])
  return editor.features.flatMap((f) => {
    if (f.properties.kind !== 'sector' || !live(f) || f.geometry.type !== 'LineString') return []
    const range = sectorDirections(f.properties, f.geometry as LineString, center)
    const type = isSectorType(f.properties.sector_type) ? f.properties.sector_type : 'other'
    return range ? [{ id: f.properties.id, type, name: f.properties.name, ...range }] : []
  })
}

/** Every zone the person can see a sentence about, with the advice in the order of the design: placement, wild, sectors. */
export function useZoneAdvice(editor: Editor) {
  return useMemo(
    () => zoneAdvice(editor.features as never, sectorRanges(editor)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editor.features],
  )
}

/**
 * « Zones »: the terrain divided by how often one goes there, from the
 * house (zone 0) to the wild (zone 5), the way Mollison and Lawton start
 * every design. Terranova proposes zones 1 to 4 from the house and the
 * paths; the person reshapes them, chooses the wild part, and the companion
 * says which elements stand too far or too near. The sectors show around
 * the zones on the same map, which is where they tell what to put where.
 */
export default function ZonesPanel() {
  const editor = useEditor()
  const map = editor.instance
  const [proposal, setProposal] = useState<ProposedZone[] | null>(null)
  const [saving, setSaving] = useState(false)
  const [withSectors, setWithSectors] = useState(true)
  const [addNumber, setAddNumber] = useState<ZoneNumber>(1)
  const active = editor.features.filter(live)
  const byNumber = (a: MapFeature, b: MapFeature) => (zoneNumberOf(a) ?? 9) - (zoneNumberOf(b) ?? 9)
  const zones = active.filter(isPermacultureZone).sort(byNumber)
  // Zones an AI proposed (propose_zones): dashed on the map, reviewed in the inspector.
  const aiDrafts = editor.features.filter((f) => f.properties.status === 'draft' && isPermacultureZone(f))
  const listed = [...zones, ...aiDrafts].sort(byNumber)
  const houses = active.filter(isDwelling)
  const buildings = active.filter((f) => f.properties.kind === 'building' && f.geometry.type === 'Polygon')
  const [houseChoice, setHouseChoice] = useState<number | null>(null)
  const advice = useZoneAdvice(editor)
  const sectors = sectorRanges(editor)
  const center = editor.map.center ?? (map.getCenter().toArray() as [number, number])

  // The zones on the map, a proposal included (dashed), under the other features.
  const shown: OverlayZone[] = [
    ...houses.map((h) => ({ key: `house-${h.properties.id}`, number: 0, color: PERMACULTURE_ZONE_COLORS[0], label: zoneLabel(0), geometry: h.geometry as Polygon, proposed: false, selected: false })),
    ...(proposal
      ? proposal.map((z, i) => ({ key: `proposed-${i}`, number: z.number, color: PERMACULTURE_ZONE_COLORS[z.number], label: zoneLabel(z.number), geometry: z.geometry, proposed: true, selected: false }))
      : listed.map((z) => {
        const n = zoneNumberOf(z) ?? 1
        return { key: String(z.properties.id), number: n, color: PERMACULTURE_ZONE_COLORS[n], label: z.properties.name || zoneLabel(n), geometry: z.geometry as Polygon | MultiPolygon, proposed: z.properties.status === 'draft', selected: editor.selectedId === z.properties.id }
      })),
  ]
  const shownKey = JSON.stringify(shown)
  useEffect(() => {
    const ensure = () => {
      try {
        showZonesOverlay(map, JSON.parse(shownKey) as OverlayZone[])
      } catch {
        /* style not ready yet: the next styledata brings us back */
      }
    }
    ensure()
    map.on('styledata', ensure)
    return () => { map.off('styledata', ensure) }
  }, [map, shownKey])
  useEffect(() => () => { try { hideZonesOverlay(map) } catch { /* map already gone */ } }, [map])

  // The sectors around the zones: the crossing that says where the windbreak, the pond, the firebreak go.
  const arcs: OverlayArc[] = withSectors
    ? [
        ...sunSectors(center[1]).map((s) => ({ key: s.type, from: s.from, to: s.to, color: SECTOR_COLORS[s.type], label: t(`sectors.sun.${s.type}`), draft: false })),
        ...sectors.map((s) => ({ key: String(s.id), from: s.from, to: s.to, color: SECTOR_COLORS[s.type], label: s.name || t(`drawing.options.sector_type.${s.type}`), draft: false })),
      ]
    : []
  const arcsKey = JSON.stringify(arcs)
  const radius = arcRadius(editor.map.bbox)
  useEffect(() => {
    const ensure = () => {
      try {
        const parsed = JSON.parse(arcsKey) as OverlayArc[]
        if (parsed.length) showSectorOverlay(map, parsed, center, radius)
        else hideSectorOverlay(map)
      } catch {
        /* style not ready yet */
      }
    }
    ensure()
    map.on('styledata', ensure)
    return () => { map.off('styledata', ensure) }
  }, [map, arcsKey, center[0], center[1], radius]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { try { hideSectorOverlay(map) } catch { /* map already gone */ } }, [map])
  // On opening, step back until the terrain and the sectors around it are in view, beside the panel.
  useEffect(() => {
    const [w, s, e, n] = arcs.length ? overlayBounds(arcs, center, radius) : editor.map.bbox ?? [0, 0, 0, 0]
    if (w === e) return
    const view = map.getBounds()
    if (view.contains([w, s]) && view.contains([e, n])) return
    const { clientWidth: width, clientHeight: height } = map.getContainer()
    const padding = width < 768
      ? { top: 130, bottom: Math.round(height * 0.55), left: 16, right: 64 }
      : { top: 70, bottom: 150, left: 330, right: 70 }
    map.fitBounds([[w, s], [e, n]], { padding, duration: 600 })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function setHouse(id: number) {
    const building = buildings.find((b) => b.properties.id === id)
    if (!building) return
    setSaving(true)
    await saveFeature(editor, id, { properties: { ...storedProperties(building), dwelling: true } })
    setSaving(false)
  }

  async function unsetHouse(house: MapFeature) {
    setSaving(true)
    await saveFeature(editor, house.properties.id, { properties: { ...storedProperties(house), dwelling: false } })
    setSaving(false)
  }

  function propose() {
    if (!editor.map.boundary) {
      editor.notify(t('permaculture_zones.proposal_no_boundary'), 'error')
      return
    }
    const paths = active.filter((f) => PATH_KINDS.includes(f.properties.kind) && f.geometry.type === 'LineString').map((f) => f.geometry as LineString)
    setProposal(proposeZones({ houses: houses.map((h) => h.geometry as Polygon), paths, boundary: editor.map.boundary }))
  }

  async function place() {
    if (!proposal?.length) return
    setSaving(true)
    try {
      await editor.undoGroup(t('permaculture_zones.panel_title'), async () => {
        for (const z of proposal) {
          await editor.createFeature({
            layer: 'notes', kind: PERMACULTURE_ZONE_KIND, geometry: z.geometry,
            properties: { zone_number: z.number }, style: { color: PERMACULTURE_ZONE_COLORS[z.number] },
          })
        }
      })
      setProposal(null)
      editor.notify(t('permaculture_zones.placed'))
    } catch {
      editor.notify(t('permaculture_zones.save_error'), 'error')
    } finally {
      setSaving(false)
    }
  }

  async function drawZone(number: ZoneNumber) {
    const geometry = await editor.draw('polygon')
    if (!geometry) return
    try {
      const created = await editor.createFeature({
        layer: 'notes', kind: PERMACULTURE_ZONE_KIND, geometry,
        properties: { zone_number: number }, style: { color: PERMACULTURE_ZONE_COLORS[number] },
      })
      editor.select(created.properties.id)
    } catch {
      editor.notify(t('permaculture_zones.save_error'), 'error')
    }
  }

  function focus(a: ZoneAdvice) {
    if (a.kind === 'placement') {
      const target = editor.features.find((f) => f.properties.id === a.featureId)
      const at = target && anchorOf(target.geometry)
      if (at) editor.instance.easeTo({ center: at as [number, number], duration: 600 })
      editor.select(a.featureId)
    }
    else if (a.kind === 'wind_unsheltered' || a.kind === 'fire_side') editor.openPanel('sectors')
  }

  const hasWild = zones.some((z) => zoneNumberOf(z) === 5)
  const house = houses[0]
  const areaOf = (f: MapFeature) => zoneAreaText(turfArea(f))

  return (
    <div className="space-y-4">
      <p className="text-sm text-loam-600">{t('permaculture_zones.intro')}</p>
      {/* The companion sends the person outside: the zones are their own habits, not a drawing. */}
      <p className="flex gap-2 rounded-lg bg-leaf-50 px-3 py-2 text-sm text-loam-700 ring-1 ring-leaf-100">
        <Footprints className="mt-0.5 h-4 w-4 shrink-0 text-leaf-700" aria-hidden />
        <span><span className="font-medium text-loam-900">{t('permaculture_zones.go_outside_title')} </span>{t('permaculture_zones.go_outside')}</span>
      </p>

      <section className="space-y-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-loam-900"><House className="h-4 w-4" aria-hidden />{t('permaculture_zones.house_title')}</h3>
        {house ? (
          <div className="flex items-center gap-2 text-sm text-loam-700">
            <span className="h-2.5 w-6 shrink-0 rounded-full" style={{ background: PERMACULTURE_ZONE_COLORS[0] }} aria-hidden />
            <span>{t('permaculture_zones.house_is', { name: house.properties.name || t('permaculture_zones.house') })}</span>
            {editor.canEdit && (
              <Button size="sm" variant="ghost" className="ml-auto" disabled={saving} onClick={() => void unsetHouse(house)}>{t('permaculture_zones.house_change')}</Button>
            )}
          </div>
        ) : buildings.length === 0 ? (
          <p className="text-sm text-loam-500">{t('permaculture_zones.house_none')}</p>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-loam-600">{t('permaculture_zones.house_missing')}</p>
            {editor.canEdit && (
              <div className="flex items-end gap-2">
                <Field label={t('permaculture_zones.house_pick')} className="flex-1">
                  <Select value={houseChoice ?? buildings[0].properties.id} onChange={(e) => setHouseChoice(Number(e.target.value))}>
                    {buildings.map((b) => (
                      <option key={b.properties.id} value={b.properties.id}>{b.properties.name || t('permaculture_zones.house_building', { area: areaOf(b) })}</option>
                    ))}
                  </Select>
                </Field>
                <Button size="sm" disabled={saving} onClick={() => void setHouse(houseChoice ?? buildings[0].properties.id)}>{t('permaculture_zones.house_set')}</Button>
              </div>
            )}
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-loam-900">{proposal ? t('permaculture_zones.proposal_title') : t('permaculture_zones.list_title')}</h3>
        {proposal ? (
          proposal.length === 0 ? <p className="text-sm text-loam-500">{t('permaculture_zones.proposal_empty')}</p> : (
            <ul className="space-y-1">
              {[...new Set(proposal.map((z) => z.number))].map((n) => (
                <li key={n} className="flex items-center gap-2 px-1.5 text-sm">
                  <span className="h-2.5 w-6 shrink-0 rounded-full opacity-70" style={{ background: PERMACULTURE_ZONE_COLORS[n] }} aria-hidden />
                  <span className="whitespace-nowrap font-medium text-loam-900">{zoneLabel(n)}</span>
                  <span className="truncate text-loam-500">{t(`permaculture_zones.frequency.${n}`)}</span>
                  <span className="ml-auto shrink-0 text-loam-500">{zoneAreaText(proposal.filter((z) => z.number === n).reduce((sum, z) => sum + z.areaM2, 0))}</span>
                </li>
              ))}
            </ul>
          )
        ) : listed.length === 0 ? (
          <p className="text-sm text-loam-500">{t('permaculture_zones.empty')}</p>
        ) : (
          <ul className="space-y-1">
            {listed.map((z) => {
              const n = zoneNumberOf(z) ?? 1
              const proposed = z.properties.status === 'draft'
              return (
                <li key={z.properties.id}>
                  {/* design-lint-ok: a row of the zone list, selected like a map element, not a pill action */}
                  <button
                    type="button"
                    onClick={() => editor.select(z.properties.id)}
                    className={clsx('flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-sm hover:bg-loam-50', editor.selectedId === z.properties.id && 'bg-loam-100')}
                  >
                    <span className="h-2.5 w-6 shrink-0 rounded-full" style={{ background: PERMACULTURE_ZONE_COLORS[n] }} aria-hidden />
                    <span className="whitespace-nowrap font-medium text-loam-900">{z.properties.name || zoneLabel(n)}</span>
                    {proposed
                      ? <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-prune-50 px-2 text-sm text-prune-700"><Bot className="h-3.5 w-3.5" aria-hidden />{t('sectors.proposed')}</span>
                      : <span className="truncate text-loam-500">{t(`permaculture_zones.frequency.${n}`)}</span>}
                    <span className="ml-auto shrink-0 text-loam-500">{areaOf(z)}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}

        {editor.canEdit && proposal && (
          <div className="flex gap-2">
            <Button size="sm" disabled={saving || proposal.length === 0} onClick={() => void place()}>{t('permaculture_zones.proposal_place')}</Button>
            <Button size="sm" variant="ghost" onClick={() => setProposal(null)}>{t('permaculture_zones.proposal_cancel')}</Button>
          </div>
        )}
        {editor.canEdit && !proposal && house && listed.length === 0 && (
          <div className="space-y-1">
            <Button size="sm" onClick={propose}><Sparkles className="h-4 w-4" aria-hidden />{t('permaculture_zones.propose')}</Button>
            <p className="text-sm text-loam-500">{t('permaculture_zones.propose_hint')}</p>
          </div>
        )}
        {editor.canEdit && !proposal && zones.length > 0 && !hasWild && (
          <Button size="sm" variant="secondary" disabled={editor.drawing} onClick={() => void drawZone(5)}>
            <PenLine className="h-4 w-4" aria-hidden />{t('permaculture_zones.wild_add')}
          </Button>
        )}
        {editor.canEdit && !proposal && (
          <div className="flex items-end gap-2">
            <Field label={t('permaculture_zones.add_number')} className="flex-1">
              <Select value={addNumber} onChange={(e) => setAddNumber(Number(e.target.value) as ZoneNumber)}>
                {ZONE_NUMBERS.map((n) => <option key={n} value={n}>{`${zoneLabel(n)} · ${t(`permaculture_zones.frequency.${n}`)}`}</option>)}
              </Select>
            </Field>
            <Button size="sm" variant="secondary" disabled={editor.drawing} onClick={() => void drawZone(addNumber)}>
              <PenLine className="h-4 w-4" aria-hidden />{t('permaculture_zones.add_start')}
            </Button>
          </div>
        )}
      </section>

      <label className="flex items-center gap-2 text-sm text-loam-700">
        <input type="checkbox" checked={withSectors} onChange={(e) => setWithSectors(e.target.checked)} className="h-4 w-4 rounded border-loam-300 text-prune-600 focus:ring-prune-500" />
        {t('permaculture_zones.sectors_toggle')}
      </label>
      {withSectors && sectors.length === 0 && (
        <p className="text-sm text-loam-500">
          {t('permaculture_zones.sectors_none')}{' '}
          <Button variant="ghost" size="sm" onClick={() => editor.openPanel('sectors')}>{t('permaculture_zones.open_sectors')}</Button>
        </p>
      )}

      {(zones.length > 0 || houses.length > 0) && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-loam-900">{t('permaculture_zones.advice_title')}</h3>
          {advice.length === 0 ? <p className="text-sm text-loam-500">{t('permaculture_zones.advice_none')}</p> : (
            <ul className="space-y-2">
              {advice.map((a, i) => (
                <li key={i} className="rounded-lg p-3 text-sm text-loam-700 ring-1 ring-loam-200">
                  <p className="flex gap-2"><TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-humus-600" aria-hidden />{adviceText(a)}</p>
                  {(a.kind === 'placement' || a.kind === 'wind_unsheltered' || a.kind === 'fire_side') && (
                    <Button variant="ghost" size="sm" onClick={() => focus(a)} className="mt-1.5 -ml-3">
                      <LocateFixed className="h-3.5 w-3.5" aria-hidden />{t(a.kind === 'placement' ? 'permaculture_zones.show' : 'permaculture_zones.open_sectors')}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  )
}
