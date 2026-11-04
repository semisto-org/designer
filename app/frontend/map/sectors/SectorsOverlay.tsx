import type { LineString, Position } from 'geojson'
import { useEffect, useLayoutEffect, useMemo } from 'react'
import { t } from '@/lib/i18n'
import { useEditor } from '@/map/editor/EditorContext'
import { hideSectorOverlay, showSectorOverlay, type OverlayArc } from '@/map/sectors/overlay'
import {
  arcRadius, displayedGroups, isSectorSeason, isSectorType, SECTOR_COLORS, sectorDirections, sectorGroup, showsIn, sunSectors,
  type SectorGroup,
} from '@/map/sectors/sectors'
import { initSectorView, useSectorView, type SectorView } from '@/map/sectors/store'
import type { MapFeature } from '@/types'

export const isSector = (f: MapFeature) => f.properties.kind === 'sector' && f.geometry.type === 'LineString'

/** The sectors of the map the analysis shows: accepted ones and an AI's drafts. */
export const mapSectors = (features: MapFeature[]) =>
  features.filter((f) => isSector(f) && (f.properties.status === 'active' || f.properties.status === 'draft'))

export const sectorSeasonOf = (f: MapFeature) => (isSectorSeason(f.properties.sector_season) ? f.properties.sector_season : 'all_year')

export const sectorTypeOf = (f: MapFeature) => (isSectorType(f.properties.sector_type) ? f.properties.sector_type : 'other')

/** The groups the map has something in (the sun always, where it rises and sets), in their order. */
export function presentGroups(features: MapFeature[], latitude: number): SectorGroup[] {
  const groups = new Set<SectorGroup>()
  if (sunSectors(latitude).length > 0) groups.add('sun')
  mapSectors(features).forEach((f) => groups.add(sectorGroup(sectorTypeOf(f))))
  return [...groups]
}

/**
 * The arcs drawn around the terrain: the sun at the solstices and the
 * sectors noted, for the season looked at and the groups shown, the one
 * being edited in the panel in place of its saved version.
 */
export function sectorArcs(features: MapFeature[], center: Position, view: Pick<SectorView, 'season' | 'hiddenGroups' | 'editing'>): OverlayArc[] {
  const { season, hiddenGroups, editing } = view
  const shownGroup = (group: SectorGroup) => !hiddenGroups.includes(group)
  const sun = shownGroup('sun') ? sunSectors(center[1]).filter((s) => season === 'all' || s.type === `${season}_sun`) : []
  return [
    ...sun.map((s) => ({ key: s.type, from: s.from, to: s.to, color: SECTOR_COLORS[s.type], label: t(`sectors.sun.${s.type}`), draft: false })),
    ...mapSectors(features).flatMap((f): OverlayArc[] => {
      if (editing && editing.id === f.properties.id) return []
      const type = sectorTypeOf(f)
      if (!showsIn(sectorSeasonOf(f), season) || !shownGroup(sectorGroup(type))) return []
      const range = sectorDirections(f.properties, f.geometry as LineString, center)
      return range ? [{ key: String(f.properties.id), ...range, color: SECTOR_COLORS[type], label: f.properties.name || t(`drawing.options.sector_type.${type}`), draft: f.properties.status === 'draft' }] : []
    }),
    // The sector being edited always shows: one sees what one draws.
    ...(editing?.arc ? [editing.arc] : []),
  ]
}

/**
 * Always mounted in the editor: draws the sector analysis around the
 * terrain while the « Secteurs » panel is open, and keeps it on the map
 * afterwards when the viewer asked for it (to present a design), group by
 * group (sun, winds, risks, nuisances, views, wildlife). The « Soleil »
 * panel shows the sun's arcs too, for as long as it is open.
 */
export default function SectorsOverlay() {
  const editor = useEditor()
  const map = editor.instance
  useLayoutEffect(() => initSectorView(editor.map.id), [editor.map.id])
  const view = useSectorView()
  const groups = view.mapId === editor.map.id ? displayedGroups(editor.activePanel, view) : null
  const center = useMemo(
    () => editor.map.center ?? (map.getCenter().toArray() as [number, number]),
    [editor.map.center, map], // eslint-disable-line react-hooks/exhaustive-deps
  )
  const arcsKey = groups ? JSON.stringify(sectorArcs(editor.features, center, { ...view, ...groups })) : null
  const radius = arcRadius(editor.map.bbox)

  useEffect(() => {
    if (arcsKey == null) {
      try { hideSectorOverlay(map) } catch { /* map already gone */ }
      return
    }
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
  }, [map, arcsKey, center, radius])
  useEffect(() => () => { try { hideSectorOverlay(map) } catch { /* map already gone */ } }, [map])

  return null
}
