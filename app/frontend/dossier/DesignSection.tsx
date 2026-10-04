import { Fragment } from 'react'
import { formatArea, formatLength, formatNumber, t } from '@/lib/i18n'
import { elementFor } from '@/map/drawing/catalog'
import { computedValues } from '@/map/drawing/computed'
import { LAYER_COLORS } from '@/map/layers/features'
import { Muted, Section, Table, Td, Th, fr } from '@/dossier/parts'
import type { MapFeature } from '@/types'
import type { Dossier } from '@/types/dossier'

const MAX_DETAILS = 3

/** A few of an element's properties in words (« Profondeur 1,2 m »), from the element library. */
function details(feature: MapFeature | undefined): string[] {
  if (!feature) return []
  const spec = elementFor(feature.properties.kind)
  if (!spec) return []
  const props = feature.properties
  const fields = spec.fields.flatMap((field) => {
    const value = props[field.key]
    if (value == null || value === '') return []
    const label = t(`drawing.fields.${field.key}`)
    switch (field.type) {
      case 'number':
      case 'integer':
        return typeof value === 'number' ? [`${label} ${fr(value)}${field.unit ? ` ${field.unit}` : ''}`] : []
      case 'select':
        return [`${label}\u00a0: ${t(`drawing.options.${field.key}.${value}`).toLowerCase()}`]
      case 'boolean':
        return value === true ? [`${label.toLowerCase()}\u00a0: ${t('dossier.design.yes_value')}`] : []
      case 'text':
        return [`${label}\u00a0: ${String(value)}`]
      default:
        return []
    }
  }).slice(0, MAX_DETAILS)
  const estimates = computedValues(feature, spec).map((c) => `${c.label} ≈ ${c.value}`)
  return [...fields, ...estimates]
}

/** Elements per design layer and kind: counts, lengths, areas, estimates. */
export function DesignSection({ dossier, number }: { dossier: Dossier; number: number }) {
  const byId = new Map(dossier.cover.features.features.map((f) => [f.properties.id, f]))
  const { layers } = dossier.design
  return (
    <Section id="design" number={number} title={t('dossier.sections.design')} intro={layers.length > 0 ? t('dossier.design.intro') : undefined}>
      {layers.length === 0 ? (
        <Muted>{t('dossier.design.empty')}</Muted>
      ) : (
        <>
          <Table
            head={<>
              <Th>{t('dossier.design.element')}</Th>
              <Th className="text-right">{t('dossier.design.count')}</Th>
              <Th className="text-right">{t('dossier.design.length')}</Th>
              <Th className="text-right">{t('dossier.design.area')}</Th>
            </>}
          >
            {layers.map((layer) => (
              <tbody key={layer.layer} className="dossier-keep">
                <tr>
                  <td colSpan={4} className="pb-1 pt-4 text-xs font-semibold uppercase tracking-wide text-loam-600">
                    <span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: LAYER_COLORS[layer.layer] ?? '#6e6355' }} aria-hidden />
                    {t(`editor.layers.${layer.layer}`)}
                  </td>
                </tr>
                {layer.kinds.map((kind) => {
                  // One element of a kind: a single row, its name and details inline.
                  const single = kind.items.length === 1 && kind.more === 0 ? kind.items[0] : null
                  const kindLabel = t(`editor.kinds.${kind.kind}`)
                  const singleName = single?.name && single.name.toLowerCase() !== kindLabel.toLowerCase() ? single.name : null
                  const singleLines = single ? details(byId.get(single.id)) : []
                  const itemised = !single && (kind.items.length > 1 || kind.items.some((i) => i.name || details(byId.get(i.id)).length))
                  return (
                    <Fragment key={kind.kind}>
                      <tr className="border-b border-loam-100">
                        <Td className="font-medium text-loam-900">
                          {kindLabel}
                          {singleName && <span className="font-normal text-loam-700"> · {singleName}</span>}
                          {singleLines.length > 0 && <span className="block text-xs font-normal text-loam-500">{singleLines.join(' · ')}</span>}
                          {layer.layer === 'plants' && kind.items.length === 0 && <span className="block text-xs font-normal text-loam-500">{t('dossier.design.plants_note')}</span>}
                        </Td>
                        <Td className="text-right tabular-nums">{formatNumber(kind.count)}</Td>
                        <Td className="text-right tabular-nums">{kind.lengthM != null ? formatLength(kind.lengthM) : '—'}</Td>
                        <Td className="text-right tabular-nums">{kind.areaM2 != null ? formatArea(kind.areaM2) : '—'}</Td>
                      </tr>
                      {itemised && kind.items.map((item) => {
                        const lines = details(byId.get(item.id))
                        return (
                          <tr key={item.id} className="border-b border-loam-100 text-loam-600">
                            <Td className="pl-4">
                              <span className="text-loam-800">{item.name ?? t('dossier.design.unnamed')}</span>
                              {lines.length > 0 && <span className="block text-xs text-loam-500">{lines.join(' · ')}</span>}
                            </Td>
                            <Td />
                            <Td className="text-right tabular-nums">{item.lengthM != null ? formatLength(item.lengthM) : ''}</Td>
                            <Td className="text-right tabular-nums">{item.areaM2 != null ? formatArea(item.areaM2) : ''}</Td>
                          </tr>
                        )
                      })}
                      {kind.more > 0 && (
                        <tr className="border-b border-loam-100"><Td className="pl-4 text-xs text-loam-500">{t('dossier.design.more', { count: kind.more })}</Td><Td /><Td /><Td /></tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            ))}
          </Table>
        </>
      )}
    </Section>
  )
}
