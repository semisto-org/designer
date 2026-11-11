import * as turf from '@turf/turf'
import { ArrowDownRight, Footprints, Gauge } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Field, Select } from '@/components/ui/Field'
import { Button } from '@/components/ui/Button'
import { api } from '@/lib/api'
import { formatNumber, t } from '@/lib/i18n'
import { ELEMENTS, storedProperties } from '@/map/drawing/catalog'
import { bar } from '@/map/drawing/computed'
import { saveFeature } from '@/map/drawing/save'
import { useEditor } from '@/map/editor/EditorContext'
import type { MapFeature } from '@/types'

// Twins of MapFeature::WaterLinks (ENDPOINT_LAYERS, ENDPOINT_GEOMETRIES).
const ENDPOINT_LAYERS = ['existing', 'water', 'structures', 'animals', 'networks']
const ENDPOINT_GEOMETRIES = ['Point', 'Polygon', 'MultiPolygon']
const CHOICES = 12
type EndKey = 'from_id' | 'to_id'

const isLink = (f: MapFeature) => ELEMENTS[f.properties.kind]?.links === true
const isEndpoint = (f: MapFeature) =>
  ENDPOINT_LAYERS.includes(f.properties.layer) && ENDPOINT_GEOMETRIES.includes(f.geometry.type) && !isLink(f)

/** Pipes, ditches, swales… and the tanks, ponds and roofs they can connect. */
export function appliesToLinks(feature: MapFeature): boolean {
  return feature.properties.status !== 'rejected' && (isLink(feature) || isEndpoint(feature))
}

/** GET /maps/:id/water_links/:feature_id (WaterLinks::Report). */
type Endpoint = { id: number; kind: string; label: string; aboveGroundM: number }
type LinkReport = {
  from: Endpoint | null
  to: Endpoint | null
  relief: boolean
  slopeDropM: number | null
  dropM: number | null
  pressureBar: number | null
}

const meters = (m: number) => `${formatNumber(Math.round(m * 10) / 10)} m`
const endId = (f: MapFeature, key: EndKey) => (typeof f.properties[key] === 'number' ? (f.properties[key] as number) : null)
const label = (f: MapFeature) => f.properties.name || t(`editor.kinds.${f.properties.kind}`)

/**
 * « Raccordements » of a water link: the element it leaves and the one it
 * reaches (snapped by the server when an end is drawn on them, changeable
 * here), and the drop between them with the pressure it gives at the
 * outlet. On a tank or a pond: the links that leave it or reach it.
 */
export default function LinksSection({ feature }: { feature: MapFeature }) {
  return isLink(feature) ? <LinkEnds feature={feature} /> : <LinkedTo feature={feature} />
}

function LinkEnds({ feature }: { feature: MapFeature }) {
  const editor = useEditor()
  const from = endId(feature, 'from_id')
  const to = endId(feature, 'to_id')
  const [report, setReport] = useState<LinkReport | null>(null)
  const coords = feature.geometry.type === 'LineString' ? feature.geometry.coordinates : []

  // Nearest elements first, from each end of the line.
  const choices = useMemo(() => {
    const endpoints = editor.features.filter((f) => f.properties.id !== feature.properties.id && f.properties.status !== 'rejected' && isEndpoint(f))
    const near = (point: number[] | undefined) => {
      if (!point) return endpoints.slice(0, CHOICES)
      const p = turf.point(point)
      return endpoints
        .map((f) => ({ f, d: turf.distance(p, turf.pointOnFeature(f), { units: 'meters' }) }))
        .sort((a, b) => a.d - b.d)
        .slice(0, CHOICES)
        .map(({ f }) => f)
    }
    return { from_id: near(coords[0]), to_id: near(coords[coords.length - 1]) }
  }, [editor.features, feature.properties.id, coords])

  useEffect(() => {
    if (from == null && to == null) {
      setReport(null)
      return
    }
    let live = true
    api<LinkReport>(`/maps/${editor.map.id}/water_links/${feature.properties.id}`)
      .then((r) => live && setReport(r))
      .catch(() => live && setReport(null))
    return () => { live = false }
  }, [editor.map.id, feature.properties.id, from, to, feature.properties.updatedAt])

  function link(key: EndKey, value: string) {
    const properties = storedProperties(feature)
    properties[key] = value ? Number(value) : null
    void saveFeature(editor, feature.properties.id, { properties })
  }

  const byId = (id: number | null) => (id == null ? null : editor.features.find((f) => f.properties.id === id) ?? null)

  function endField(key: EndKey) {
    const current = byId(endId(feature, key))
    const options = current && !choices[key].includes(current) ? [current, ...choices[key]] : choices[key]
    const title = t(key === 'from_id' ? 'water_links.from' : 'water_links.to')
    if (!editor.canEdit) {
      return (
        <div className="flex justify-between gap-2 text-sm">
          <span className="text-loam-500">{title}</span>
          <span className="text-right">{current ? label(current) : t('water_links.none')}</span>
        </div>
      )
    }
    return (
      <Field label={title}>
        <Select value={current?.properties.id ?? ''} onChange={(e) => link(key, e.target.value)}>
          <option value="">{t('water_links.none')}</option>
          {options.map((f) => <option key={f.properties.id} value={f.properties.id}>{label(f)}</option>)}
        </Select>
      </Field>
    )
  }

  return (
    <section className="space-y-2 border-t border-loam-100 pt-3">
      <h3 className="text-sm font-medium text-loam-700">{t('water_links.title')}</h3>
      {endField('from_id')}
      {endField('to_id')}
      {editor.canEdit && <p className="text-sm text-loam-500">{t('water_links.snapped')}</p>}
      {report?.dropM != null && <Drop report={report} />}
    </section>
  )
}

function Drop({ report }: { report: LinkReport }) {
  const drop = report.dropM!
  const height = report.from?.aboveGroundM ?? 0
  return (
    <div className="space-y-1 rounded-2xl bg-loam-50 p-3 text-sm text-loam-700">
      <p className="flex items-start gap-1.5 font-medium text-loam-900">
        <ArrowDownRight className="mt-0.5 h-4 w-4 shrink-0 text-prune-600" aria-hidden />
        {t('water_links.drop', { value: meters(drop) })}
      </p>
      {report.relief && report.slopeDropM != null && height > 0 && (
        <p>{t('water_links.drop_detail', { height: meters(height), slope: meters(report.slopeDropM) })}</p>
      )}
      {!report.relief && <p className="text-loam-500">{t('water_links.drop_height_only')}</p>}
      {report.pressureBar != null ? (
        <p className="flex items-start gap-1.5">
          <Gauge className="mt-0.5 h-4 w-4 shrink-0 text-leaf-700" aria-hidden />
          {t('water_links.pressure', { value: bar(report.pressureBar) })}
        </p>
      ) : drop < 0 && <p className="text-humus-700">{t('water_links.uphill')}</p>}
      <p className="text-loam-500">{t('water_links.pressure_hint')}</p>
      <p className="flex items-start gap-1.5 text-leaf-800">
        <Footprints className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        {t('water_links.look')}
      </p>
    </div>
  )
}

function LinkedTo({ feature }: { feature: MapFeature }) {
  const editor = useEditor()
  const id = feature.properties.id
  const links = editor.features.filter((f) => isLink(f) && f.properties.status !== 'rejected' && (endId(f, 'from_id') === id || endId(f, 'to_id') === id))
  if (links.length === 0) return null
  const byId = (other: number | null) => (other == null ? null : editor.features.find((f) => f.properties.id === other) ?? null)

  return (
    <section className="space-y-1 border-t border-loam-100 pt-3">
      <h3 className="text-sm font-medium text-loam-700">{t('water_links.links_title')}</h3>
      <ul className="space-y-0.5">
        {links.map((link) => {
          const out = endId(link, 'from_id') === id
          const other = byId(endId(link, out ? 'to_id' : 'from_id'))
          return (
            <li key={link.properties.id}>
              <Button variant="ghost" size="sm" className="-ml-3 text-left font-normal" onClick={() => editor.select(link.properties.id)}>
                {t(out ? 'water_links.out' : 'water_links.in', { link: label(link), other: other ? label(other) : t('water_links.nowhere') })}
              </Button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
