import clsx from 'clsx'
import { ExternalLink, Hourglass, MapPin, Shovel, Snowflake, TreeDeciduous, X } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { MonthsCalendar } from '@/components/plants/MonthsCalendar'
import { SpeciesSheetPhoto } from '@/components/plants/SpeciesPhoto'
import { SpeciesTags } from '@/components/plants/SpeciesTags'
import { formatDate, formatDecimal, metres, plantedLabel, plantedPrecision, strataLabel, vocab } from '@/components/plants/format'
import { api } from '@/lib/api'
import { t } from '@/lib/i18n'
import { StrataDot } from '@/map/plants/strata'
import { displayValue, formatEuro } from '@/palette/format'
import { toPlant, type PaletteRow } from '@/palette/table'
import type { SpeciesSheet, Strata } from '@/types/plants'

type PlantOnLand = { id: number; number: number | null; name: string | null; tags: string[]; plantedOn: string | null; plantedPrecision: string | null; inPatch: boolean; survival: string | null; vigor: number | null; observedOn: string | null }
type PatchOnLand = { id: number; name: string | null; tags: string[]; areaM2: number | null; quantity: number }
type TreeOnLand = { id: number; name: string | null; label: string; tags: string[]; heightM: number | null; health: string | null }
type Details = { key: string; plants: PlantOnLand[]; patches: PatchOnLand[]; existingTrees: TreeOnLand[] }

const PLANTS_SHOWN = 12

const SURVIVAL_TONES: Record<string, string> = {
  established: 'bg-leaf-50 text-leaf-800 ring-leaf-200',
  struggling: 'bg-humus-50 text-humus-800 ring-humus-200',
  dead: 'bg-clay-50 text-clay-700 ring-clay-200',
}

/**
 * The sheet of one plant of the palette, opened from its name: on one side
 * what the catalogue knows of the species, on the other its life on this
 * land (quantities, the project's choices, every plant on the map with its
 * planting date and latest observation, the patches that hold it).
 */
export function PlantSheet({ mapId, row, country, onClose }: { mapId: number; row: PaletteRow; country?: string | null; onClose: () => void }) {
  const [species, setSpecies] = useState<SpeciesSheet | null>(null)
  const [details, setDetails] = useState<Details | null>(null)
  const [error, setError] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const panel = useRef<HTMLElement>(null)

  useEffect(() => {
    let live = true
    setSpecies(null); setDetails(null); setError(false); setShowAll(false)
    const catalogue = row.speciesId == null
      ? Promise.resolve(null)
      : api<{ species: SpeciesSheet }>(`/plants/${row.speciesId}.json`).then((res) => res.species)
    Promise.all([catalogue, api<Details>(`/maps/${mapId}/palette/plants/${encodeURIComponent(row.key)}`)])
      .then(([sheet, land]) => { if (live) { setSpecies(sheet); setDetails(land) } })
      .catch(() => { if (live) setError(true) })
    return () => { live = false }
  }, [mapId, row.key, row.speciesId])

  useEffect(() => {
    panel.current?.focus()
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [onClose])

  const variety = row.varietyId ? species?.varieties.find((v) => v.id === row.varietyId) : null
  const plants = details?.plants ?? []
  const firstPlanted = plants.filter((p) => p.plantedPrecision !== 'unknown').map((p) => p.plantedOn).filter((d): d is string => !!d).sort()[0]

  return (
    <div className="fixed inset-0 z-50 flex justify-end print:hidden" role="dialog" aria-modal="true" aria-label={row.name}>
      <button type="button" className="absolute inset-0 bg-loam-900/25" onClick={onClose} aria-label={t('plant_palette.sheet.close')} tabIndex={-1} />
      <aside ref={panel} tabIndex={-1} className="relative flex h-full w-full max-w-xl flex-col overflow-y-auto bg-loam-50 shadow-2xl outline-none">
        <header className="sticky top-0 z-10 flex items-start gap-3 border-b border-loam-900/10 bg-loam-50/95 px-5 py-4 backdrop-blur">
          <div className="min-w-0 flex-1">
            <h2 className="font-serif text-2xl font-semibold text-prune-800">{row.name}</h2>
            {row.latinName && <p className="text-base italic text-loam-600">{row.latinName}</p>}
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-2 text-loam-600 hover:bg-loam-200/60" aria-label={t('plant_palette.sheet.close')}>
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="space-y-5 px-5 py-5">
          {error && <p className="rounded-lg bg-clay-50 p-3 text-sm text-clay-700">{t('plant_palette.sheet.load_error')}</p>}
          {!error && !details && <p className="text-sm text-loam-500">{t('plant_palette.sheet.loading')}</p>}

          {details && (
            <section aria-labelledby="sheet-land">
              <h3 id="sheet-land" className="mb-3 font-serif text-xl font-semibold text-leaf-800">{t('plant_palette.sheet.on_land')}</h3>
              <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Stat label={t('plant_palette.columns.existing')} value={row.existing} />
                <Stat label={t('plant_palette.columns.planned')} value={row.planned} />
                <Stat label={t('plant_palette.columns.planted')} value={row.planted} tone="leaf" />
                <Stat label={t('plant_palette.columns.to_plant')} value={toPlant(row)} tone="humus" />
              </dl>

              {row.speciesId != null && (row.role || row.unitPrice != null || row.supplier || row.size || row.notes || row.targetCount) && (
                <div className="mt-4 rounded-2xl bg-white p-4 ring-1 ring-loam-900/10">
                  <h4 className="mb-2 font-medium text-loam-800">{t('plant_palette.sheet.choices')}</h4>
                  <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                    {row.role && <Pair label={t('plant_palette.columns.role')}>{displayValue(row, 'role')}</Pair>}
                    {row.targetCount != null && <Pair label={t('plant_palette.columns.target')}>{row.targetCount}</Pair>}
                    {row.size && <Pair label={t('plant_palette.columns.size')}>{row.size}</Pair>}
                    {row.supplier && <Pair label={t('plant_palette.columns.supplier')}>{row.supplier}</Pair>}
                    {row.unitPrice != null && <Pair label={t('plant_palette.columns.unit_price')}>{formatEuro(row.unitPrice)}</Pair>}
                    {row.unitPrice != null && row.planned > 0 && <Pair label={t('plant_palette.columns.amount')}>{formatEuro(row.unitPrice * row.planned)}</Pair>}
                    {row.notes && <Pair label={t('plant_palette.columns.notes')}><span className="whitespace-pre-line">{row.notes}</span></Pair>}
                  </dl>
                </div>
              )}

              {(firstPlanted || species?.maturityYears || species?.productionStartYear) && (
                <div className="mt-4 flex gap-3 rounded-2xl bg-leaf-50 p-4 text-sm text-leaf-900 ring-1 ring-leaf-200">
                  <Hourglass className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  <div>
                    <p className="font-medium">{t('plant_palette.sheet.time.title')}</p>
                    <ul className="mt-1 space-y-0.5">
                      {firstPlanted && <li>{t('plant_palette.sheet.time.planted_since', { date: formatDate(firstPlanted) })}</li>}
                      {species?.productionStartYear && <li>{t('plant_palette.sheet.time.production', { years: species.productionStartYear })}</li>}
                      {species?.maturityYears && <li>{t('plant_palette.sheet.time.maturity', { years: species.maturityYears })}</li>}
                    </ul>
                  </div>
                </div>
              )}

              {details.existingTrees.length > 0 && (
                <Block title={t('plant_palette.sheet.existing_trees')}>
                  {details.existingTrees.map((tree) => (
                    <FeatureLine key={tree.id} mapId={mapId} featureId={tree.id} icon={<TreeDeciduous className="h-4 w-4 text-loam-500" />} title={tree.name || tree.label} tags={tree.tags}>
                      {[tree.heightM != null ? metres(tree.heightM) : null, tree.health ? t(`plant_palette.sheet.health.${tree.health}`) : null].filter(Boolean).join(' · ')}
                    </FeatureLine>
                  ))}
                </Block>
              )}

              {plants.length > 0 && (
                <Block title={`${t('plant_palette.sheet.plants')} · ${t('plant_palette.sheet.plants_count', { count: plants.length })}`}>
                  {(showAll ? plants : plants.slice(0, PLANTS_SHOWN)).map((plant, i) => (
                    <FeatureLine
                      key={plant.id} mapId={mapId} featureId={plant.id} title={plant.name || t('plant_palette.sheet.plant_number', { number: plant.number ?? i + 1 })} tags={plant.tags}
                      icon={<Shovel className={clsx('h-4 w-4', plant.plantedOn ? 'text-leaf-600' : 'text-loam-300')} />}
                    >
                      <span>{plant.plantedOn ? plantedLabel(plant.plantedOn, plantedPrecision(plant.plantedPrecision)) : t('plant_palette.sheet.not_planted')}</span>
                      {plant.survival && (
                        <span className={clsx('ml-2 inline-flex rounded-full px-2 py-px ring-1 ring-inset', SURVIVAL_TONES[plant.survival])} title={plant.observedOn ? t('plant_palette.sheet.observed', { date: formatDate(plant.observedOn) }) : undefined}>
                          {t(`plant_palette.sheet.survival.${plant.survival}`)}
                        </span>
                      )}
                    </FeatureLine>
                  ))}
                  {!showAll && plants.length > PLANTS_SHOWN && (
                    <li><button type="button" onClick={() => setShowAll(true)} className="py-2 text-sm text-prune-700 underline underline-offset-2">{t('plant_palette.sheet.more_plants', { count: plants.length - PLANTS_SHOWN })}</button></li>
                  )}
                </Block>
              )}

              {details.patches.length > 0 && (
                <Block title={t('plant_palette.sheet.patches')}>
                  {details.patches.map((patch) => (
                    <FeatureLine key={patch.id} mapId={mapId} featureId={patch.id} title={patch.name || t('plant_palette.sheet.patch_unnamed')} tags={patch.tags} icon={<MapPin className="h-4 w-4 text-loam-500" />}>
                      {t('plant_palette.sheet.patch_line', { quantity: patch.quantity, area: patch.areaM2 == null ? '—' : formatDecimal(Math.round(patch.areaM2)) })}
                    </FeatureLine>
                  ))}
                </Block>
              )}
            </section>
          )}

          {details && row.speciesId == null && (
            <p className="rounded-2xl bg-white p-4 text-sm text-loam-600 ring-1 ring-loam-900/10">{t('plant_palette.sheet.not_in_catalogue')}</p>
          )}

          {species && (
            <section aria-labelledby="sheet-catalogue" className="border-t border-dashed border-loam-300 pt-5">
              <div className="mb-3 flex items-baseline justify-between gap-3">
                <h3 id="sheet-catalogue" className="font-serif text-xl font-semibold text-prune-800">{t('plant_palette.sheet.catalogue')}</h3>
                <a href={`/plants/${species.slug}`} className="inline-flex items-center gap-1 text-sm text-prune-700 underline underline-offset-2">
                  {t('plant_palette.sheet.open_catalogue')}<ExternalLink className="h-3.5 w-3.5" aria-hidden />
                </a>
              </div>
              <div className="grid gap-4 sm:grid-cols-[1fr_12rem]">
                <div className="space-y-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 ring-1 ring-loam-200">
                      <StrataDot strata={row.strata as Strata} />{strataLabel(row.strata)}
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 ring-1 ring-loam-200">
                      <Snowflake className="h-3.5 w-3.5 text-loam-400" aria-hidden />
                      {species.hardinessZone ? t('plants.card.zone', { zone: species.hardinessZone }) : t('plants.card.unknown_zone')}
                    </span>
                    <SpeciesTags species={species} country={country} />
                  </div>
                  <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
                    {species.plantType && <Pair label={t('plants.fields.plant_type')}>{vocab('plant_type', species.plantType)}</Pair>}
                    <Pair label={t('plants.fields.height')}>{metres(species.heightMaxM)}</Pair>
                    <Pair label={t('plants.fields.spread')}>{metres(species.spreadMaxM ?? species.crownM)}</Pair>
                    {species.exposures.length > 0 && <Pair label={t('plants.fields.exposures')}>{species.exposures.map((e) => vocab('exposures', e)).join(', ')}</Pair>}
                    {species.soilMoisture.length > 0 && <Pair label={t('plants.fields.soil_moisture')}>{species.soilMoisture.map((e) => vocab('soil_moisture', e)).join(', ')}</Pair>}
                    {species.edibleParts.length > 0 && <Pair label={t('plants.fields.edible_parts')}>{species.edibleParts.map((e) => vocab('edible_parts', e)).join(', ')}</Pair>}
                    {species.ecoServices.length > 0 && <Pair label={t('plants.fields.eco_services')}>{species.ecoServices.map((e) => vocab('eco_services', e)).join(', ')}</Pair>}
                    {variety && <Pair label={t('plant_palette.columns.name')}>{[variety.name, variety.ripening, variety.fertility && vocab('fertility', variety.fertility)].filter(Boolean).join(' · ')}</Pair>}
                  </dl>
                </div>
                <SpeciesSheetPhoto photo={species.photo} name={row.name} strata={row.strata as Strata} className="max-w-[12rem]" />
              </div>
              <div className="mt-4 rounded-2xl bg-white p-3 ring-1 ring-loam-900/10">
                <MonthsCalendar rows={[
                  { key: 'flowering', label: t('plants.fields.flowering_months'), months: species.floweringMonths, color: '#b4acce' },
                  { key: 'fruiting', label: t('plants.fields.fruiting_months'), months: species.fruitingMonths, color: '#87b88a' },
                  { key: 'harvest', label: t('plants.fields.harvest_months'), months: species.harvestMonths, color: '#d9a527' },
                  { key: 'pruning', label: t('plants.fields.pruning_months'), months: species.pruningMonths, color: '#899e79' },
                ]} />
              </div>
            </section>
          )}
        </div>
      </aside>
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'leaf' | 'humus' }) {
  return (
    <div className={clsx('rounded-xl px-3 py-2 ring-1', tone === 'leaf' ? 'bg-leaf-50 ring-leaf-200' : tone === 'humus' ? 'bg-humus-50 ring-humus-200' : 'bg-white ring-loam-900/10')}>
      <dt className="text-sm text-loam-600">{label}</dt>
      <dd className="text-xl font-semibold tabular-nums text-loam-900">{value}</dd>
    </div>
  )
}

function Pair({ label, children }: { label: string; children: ReactNode }) {
  return (<><dt className="text-loam-500">{label}</dt><dd className="text-loam-800">{children}</dd></>)
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mt-4">
      <h4 className="mb-1 font-medium text-loam-800">{title}</h4>
      <ul className="divide-y divide-loam-100 rounded-2xl bg-white px-3 ring-1 ring-loam-900/10">{children}</ul>
    </div>
  )
}

function FeatureLine({ mapId, featureId, icon, title, tags, children }: { mapId: number; featureId: number; icon: ReactNode; title: string; tags: string[]; children: ReactNode }) {
  return (
    <li className="flex items-center gap-3 py-2 text-sm">
      <span className="shrink-0">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-loam-800">{title}</span>
        <span className="block text-loam-500">{children}</span>
        {tags.length > 0 && <span className="mt-0.5 block truncate text-loam-500">{tags.join(' · ')}</span>}
      </span>
      <a href={`/maps/${mapId}?feature=${featureId}`} className="shrink-0 rounded-full px-2.5 py-1 text-sm text-prune-700 ring-1 ring-inset ring-prune-200 hover:bg-prune-50" title={t('plant_palette.sheet.show_on_map')}>
        <MapPin className="inline h-3.5 w-3.5" aria-hidden /> <span className="hidden sm:inline">{t('plant_palette.sheet.show_on_map')}</span>
      </a>
    </li>
  )
}
