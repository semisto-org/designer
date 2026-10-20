import { ExternalLink, Shovel } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select } from '@/components/ui/Field'
import { formatDecimal, plantedLabel, plantedPrecision, strataLabel, todayIso } from '@/components/plants/format'
import { ApiError } from '@/lib/api'
import { t } from '@/lib/i18n'
import ShapeEditButton from '@/map/drawing/ShapeEditButton'
import { useEditor } from '@/map/editor/EditorContext'
import { GRAFTABLE_STRATA, graftProperties, graftProperty, isSupportPlant, numberProperty, ownProperties, SUPPORT_ROLES, TRAINABLE_STRATA, trainedCrown, trainingProperty } from '@/map/plants/properties'
import { knownRootstock, rootstocksFor } from '@/map/plants/rootstocks'
import { GRAFT_FORMS, GRAFT_TRUNK, ROOTSTOCK_VIGORS, TRUNK_RANGE, type GraftForm } from '@/relief/growth'
import { usePlanting } from '@/map/plants/store'
import { paletteItemOf, StrataDot } from '@/map/plants/strata'
import type { MapFeature } from '@/types'

const TRAININGS = ['free', 'pollard', 'coppice', 'chop_and_drop'] as const

/** Inspector section of a plant: its species (from the palette), crown, training and planting date. */
export default function PlantSection({ feature }: { feature: MapFeature }) {
  const editor = useEditor()
  const { data } = usePlanting(editor.map.id)
  const [date, setDate] = useState(todayIso())
  const [taken, setTaken] = useState<number | null>(null)
  const speciesId = numberProperty(feature, 'species_id')
  const varietyId = numberProperty(feature, 'variety_id')
  const number = numberProperty(feature, 'number')
  const plantedOn = typeof feature.properties.planted_on === 'string' ? feature.properties.planted_on : null
  const precision = plantedPrecision(feature.properties.planted_on_precision)
  const species = speciesId != null ? data?.species[String(speciesId)] : undefined
  const variety = varietyId != null ? data?.varieties[String(varietyId)] : undefined
  const palette = data?.palette ?? []
  const current = palette.find((i) => i.speciesId === speciesId && i.varietyId === varietyId)
  const strata = current?.effectiveStrata ?? species?.strata
  const training = trainingProperty(feature)
  const trainable = strata != null && TRAINABLE_STRATA.includes(strata)
  const graftable = training === 'free' && strata != null && GRAFTABLE_STRATA.includes(strata)
  const graftData = graftProperties(feature)
  const graft = graftable ? graftProperty(feature, strata) : null
  const graftForm = GRAFT_FORMS.includes(graftData.form as GraftForm) ? (graftData.form as GraftForm) : null
  const paletteRole = paletteItemOf(feature, data ?? null)?.role
  const roleSupport = paletteRole != null && SUPPORT_ROLES.includes(paletteRole)
  const succession = feature.properties.succession === 'support' || feature.properties.succession === 'productive' ? feature.properties.succession : ''
  const support = isSupportPlant(feature, paletteRole)
  const supportUntil = numberProperty(feature, 'support_until')

  async function save(patch: Record<string, unknown>) {
    const properties = { ...ownProperties(feature), ...patch }
    Object.keys(properties).forEach((key) => properties[key] == null && delete properties[key])
    try {
      await editor.updateFeature(feature.properties.id, { properties })
    } catch (e) {
      editor.notify(e instanceof Error ? e.message : String(e), 'error')
    }
  }

  // A number another plant holds is refused, then offered as a swap.
  async function renumber(value: number, swap = false) {
    const properties = { ...ownProperties(feature), number: value }
    try {
      const saved = await editor.updateFeature(feature.properties.id, { properties, swap_number: swap || undefined })
      setTaken(null)
      const other = saved.swapped?.properties.number
      if (swap && other != null) editor.notify(t('plant_feature.number_swapped', { number: String(other) }))
    } catch (e) {
      if (!swap && e instanceof ApiError && e.data.codes && JSON.stringify(e.data.codes).includes('number_taken')) setTaken(value)
      else editor.notify(e instanceof Error ? e.message : String(e), 'error')
    }
  }

  function choose(value: string) {
    const item = palette.find((i) => String(i.id) === value)
    void save({ species_id: item?.speciesId ?? null, variety_id: item?.varietyId ?? null })
  }

  return (
    <section className="space-y-3 border-t border-loam-100 pt-3 text-sm">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-loam-500">{t('plant_feature.title')}</h3>
      {species ? (
        <div className="flex items-start gap-2">
          <StrataDot strata={current?.effectiveStrata ?? species.strata} className="mt-1.5" />
          <div className="min-w-0 flex-1">
            <p className="font-medium text-loam-900">
              {variety ? variety.commonName ?? `${species.commonName ?? species.latinName} '${variety.name}'` : species.commonName ?? species.latinName}
            </p>
            <p className="text-xs italic text-loam-500">{variety?.latinName ?? species.latinName}</p>
            <p className="mt-1 text-xs text-loam-600">
              {strataLabel(current?.effectiveStrata ?? species.strata)} · {t('plant_feature.crown', { value: formatDecimal(trainedCrown(species.crownM, training, strata, graft)) })}
              {training !== 'free' && trainable && <span> ({t(`plant_feature.crown_${training}`)})</span>}
              {graft && <span> ({t('plant_feature.crown_graft', { vigor: t(`plant_feature.vigor_names.${graft.vigor}`) })})</span>}
              {species.crownIndicative && <span className="text-loam-400"> ({t('plant_feature.crown_indicative')})</span>}
            </p>
          </div>
          <a href={`/plants/${species.slug}`} target="_blank" rel="noreferrer" className="rounded p-1 text-loam-400 hover:bg-loam-100" title={t('plant_feature.open_sheet')} aria-label={t('plant_feature.open_sheet')}>
            <ExternalLink className="h-4 w-4" />
          </a>
        </div>
      ) : (
        <p className="rounded-lg bg-humus-50 p-2 text-xs text-humus-700">{t('plant_feature.no_species')}</p>
      )}

      <ShapeEditButton feature={feature} />

      {editor.canEdit ? (
        <Field label={t('plant_feature.number')} hint={t('plant_feature.number_hint')}>
          <Input
            key={`${feature.properties.id}:${number ?? ''}`}
            type="number"
            min={1}
            inputMode="numeric"
            className="w-28"
            defaultValue={number ?? ''}
            onBlur={(e) => {
              const value = Number(e.target.value)
              if (Number.isInteger(value) && value > 0 && value !== number) void renumber(value)
              else { e.target.value = number != null ? String(number) : ''; setTaken(null) }
            }}
            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
          />
          {taken != null && (
            <div className="mt-2 rounded-lg bg-humus-50 p-2 text-sm text-humus-900">
              <p>{t('plant_feature.number_taken', { number: String(taken) })}</p>
              <div className="mt-1.5 flex gap-3">
                <button type="button" className="font-medium text-prune-700 underline" onClick={() => void renumber(taken, true)}>{t('plant_feature.number_swap')}</button>
                <button type="button" className="text-loam-600 underline" onClick={() => setTaken(null)}>{t('plant_feature.unmark')}</button>
              </div>
            </div>
          )}
        </Field>
      ) : number != null ? (
        <p className="text-loam-600">{t('plant_feature.number')} : <span className="font-medium tabular-nums text-loam-900">{number}</span></p>
      ) : null}

      {editor.canEdit && (
        palette.length === 0 ? (
          <p className="text-xs text-loam-500">{t('patches.palette_empty')}</p>
        ) : (
          <Field label={t('plant_feature.choose')}>
            <Select value={current ? String(current.id) : ''} onChange={(e) => choose(e.target.value)}>
              <option value="">{species && !current ? species.commonName ?? species.latinName : t('plant_feature.choose_placeholder')}</option>
              {palette.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </Select>
          </Field>
        )
      )}

      {trainable && (editor.canEdit ? (
        <Field label={t('plant_feature.training')} hint={t('plant_feature.training_hint')}>
          <Select value={training} onChange={(e) => void save({ training: e.target.value === 'free' ? null : e.target.value })}>
            {TRAININGS.map((value) => <option key={value} value={value}>{t(`plant_feature.trainings.${value}`)}</option>)}
          </Select>
        </Field>
      ) : training !== 'free' ? (
        <p className="text-loam-600">{t('plant_feature.training')} : <span className="font-medium text-loam-900">{t(`plant_feature.trainings.${training}`)}</span></p>
      ) : null)}

      {speciesId != null && (editor.canEdit ? (
        <div className="space-y-3">
          <Field label={t('plant_feature.succession')} hint={t('plant_feature.succession_hint')}>
            <Select value={succession} onChange={(e) => void save({ succession: e.target.value || null })}>
              <option value="">{t(roleSupport ? 'plant_feature.successions.default_support' : 'plant_feature.successions.default_productive')}</option>
              <option value="support">{t('plant_feature.successions.support')}</option>
              <option value="productive">{t('plant_feature.successions.productive')}</option>
            </Select>
          </Field>
          {support && (
            <Field label={t('plant_feature.support_until')} hint={t('plant_feature.support_until_hint')}>
              <Input
                key={`${feature.properties.id}:until:${supportUntil ?? ''}`}
                type="number"
                min={1}
                max={60}
                inputMode="numeric"
                className="w-28"
                defaultValue={supportUntil ?? ''}
                placeholder={t('plant_feature.support_until_placeholder')}
                onBlur={(e) => {
                  const raw = e.target.value.trim()
                  const value = raw === '' ? null : Number(raw)
                  if (value === supportUntil) return
                  if (value === null || (Number.isInteger(value) && value >= 1 && value <= 60)) void save({ support_until: value })
                  else e.target.value = supportUntil != null ? String(supportUntil) : ''
                }}
                onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
              />
            </Field>
          )}
        </div>
      ) : support ? (
        <p className="text-loam-600">
          {supportUntil != null ? t('plant_feature.support_summary_until', { count: supportUntil }) : t('plant_feature.support_summary')}
        </p>
      ) : null)}

      {graftable && (editor.canEdit ? (
        <div className="space-y-3">
          <Field label={t('plant_feature.graft_form')} hint={t('plant_feature.graft_form_hint')}>
            <Select
              value={graft ? graftForm ?? 'custom' : ''}
              onChange={(e) => {
                const value = e.target.value
                // A new form takes its usual trunk; « Non greffé » forgets the graft.
                if (value === '') void save({ graft_form: null, trunk_height: null, rootstock_vigor: null, rootstock: null })
                else if (value !== 'custom') void save({ graft_form: value, trunk_height: null })
              }}
            >
              <option value="">{t('plant_feature.graft_forms.none')}</option>
              {GRAFT_FORMS.map((value) => <option key={value} value={value}>{t(`plant_feature.graft_forms.${value}`)}</option>)}
              {graft && !graftForm && <option value="custom">{t('plant_feature.graft_forms.custom')}</option>}
            </Select>
          </Field>
          {graft && (
            <>
              <Field label={t('plant_feature.trunk_height')} hint={t('plant_feature.trunk_height_hint')}>
                <Input
                  key={`${feature.properties.id}:trunk:${graftData.trunkHeight ?? ''}:${graftForm ?? ''}`}
                  type="number"
                  min={TRUNK_RANGE.min}
                  max={TRUNK_RANGE.max}
                  step={0.05}
                  inputMode="decimal"
                  className="w-28"
                  defaultValue={graftData.trunkHeight ?? ''}
                  placeholder={formatDecimal(graftForm ? GRAFT_TRUNK[graftForm] : graft.trunk)}
                  onBlur={(e) => {
                    const raw = e.target.value.replace(',', '.').trim()
                    const value = raw === '' ? null : Math.round(Number(raw) * 100) / 100
                    if (value === graftData.trunkHeight) return
                    if (value === null || (value >= TRUNK_RANGE.min && value <= TRUNK_RANGE.max)) void save({ trunk_height: value })
                    else e.target.value = graftData.trunkHeight != null ? String(graftData.trunkHeight) : ''
                  }}
                  onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
                />
              </Field>
              <Field label={t('plant_feature.rootstock_vigor')} hint={t('plant_feature.rootstock_vigor_hint')}>
                <Select value={graftData.vigor ?? ''} onChange={(e) => void save({ rootstock_vigor: e.target.value || null })}>
                  <option value="">{t('plant_feature.rootstock_vigors.default', { vigor: t(`plant_feature.vigor_names.${graft.vigor}`) })}</option>
                  {ROOTSTOCK_VIGORS.map((value) => <option key={value} value={value}>{t(`plant_feature.rootstock_vigors.${value}`)}</option>)}
                </Select>
              </Field>
              <Field label={t('plant_feature.rootstock')} hint={t('plant_feature.rootstock_hint')}>
                <Input
                  key={`${feature.properties.id}:rootstock:${graftData.rootstock ?? ''}`}
                  list={`rootstocks-${feature.properties.id}`}
                  maxLength={40}
                  defaultValue={graftData.rootstock ?? ''}
                  placeholder={t('plant_feature.rootstock_placeholder')}
                  onBlur={(e) => {
                    const value = e.target.value.trim() || null
                    if (value === graftData.rootstock) return
                    // A known rootstock says how vigorous the tree will be.
                    const known = knownRootstock(value)
                    void save({ rootstock: known?.name ?? value, ...(known ? { rootstock_vigor: known.vigor } : {}) })
                  }}
                  onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
                />
                <datalist id={`rootstocks-${feature.properties.id}`}>
                  {rootstocksFor(species?.latinName).map((r) => <option key={r.name} value={r.name}>{t(`plant_feature.vigor_names.${r.vigor}`)}</option>)}
                </datalist>
              </Field>
            </>
          )}
        </div>
      ) : graft ? (
        <p className="text-loam-600">
          {t('plant_feature.graft_form')} : <span className="font-medium text-loam-900">{[
            graftForm && t(`plant_feature.graft_form_names.${graftForm}`),
            t('relief.page.growth.card.trunk', { value: formatDecimal(graft.trunk) }),
            t('relief.page.growth.card.vigor', { value: t(`plant_feature.vigor_names.${graft.vigor}`) }),
            graftData.rootstock,
          ].filter(Boolean).join(', ')}</span>
        </p>
      ) : null)}

      {plantedOn ? (
        <div className="flex items-center justify-between gap-2 rounded-lg bg-leaf-50 p-2 text-sm text-leaf-800">
          <span className="inline-flex items-center gap-1.5"><Shovel className="h-4 w-4 shrink-0" />{plantedLabel(plantedOn, precision)}</span>
          {editor.canEdit && (
            <button type="button" className="text-leaf-700 underline" onClick={() => save({ planted_on: null, planted_on_precision: null })}>{t('plant_feature.unmark')}</button>
          )}
        </div>
      ) : editor.canEdit && speciesId != null ? (
        <div className="space-y-2">
          <Field label={t('plant_feature.planted_date')}>
            <Input type="date" value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Button variant="leaf" size="sm" className="w-full" disabled={!date} onClick={() => save({ planted_on: date, planted_on_precision: null }).then(() => editor.notify(t('plant_feature.planted')))}>
            <Shovel className="h-4 w-4" />{t('plant_feature.mark_planted')}
          </Button>
          <button
            type="button" title={t('plant_feature.mark_planted_unknown_hint')}
            className="w-full text-center text-sm text-leaf-800 underline"
            onClick={() => save({ planted_on: todayIso(), planted_on_precision: 'unknown' }).then(() => editor.notify(t('plant_feature.planted')))}
          >
            {t('plant_feature.mark_planted_unknown')}
          </button>
        </div>
      ) : null}
    </section>
  )
}
