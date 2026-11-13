// « Planter »: a new plant where the phone stands, read from its nursery
// label: the species (the map's first, then the whole catalogue), the
// cultivar, how it came (bare root, pot, root ball) and when it goes in.
// It joins the map's palette on the way, so the palette follows the land.
import { router, useLocalSearchParams } from 'expo-router'
import { useEffect, useMemo, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { api } from '@/lib/api'
import { catalogueOnly, cleanVariety, NURSERY_FORMS, pastYears, plantingProperties, varietySuggestions, type CatalogueSpecies, type NurseryForm, type PlantingWhen } from '@/lib/fieldPlanting'
import { gpsProperties } from '@/lib/geo'
import { formatDistance, t, todayIso } from '@/lib/i18n'
import { currentPositionWithAccuracy } from '@/lib/location'
import { display } from '@/lib/display'
import { outbox } from '@/lib/outbox'
import { speciesChoices } from '@/lib/species'
import type { Position } from '@/lib/types'
import { useOnline } from '@/state/sync'
import { useMapBundle } from '@/state/useMapBundle'
import { Body, Button, Chip, Input, Label, Notice, styles } from '@/ui/kit'
import { colors, fonts, radius, space } from '@/ui/theme'

// A planting round places many plants the same way: the next one starts
// with the choices of the last (as long as the app stays open).
let lastWhen: PlantingWhen = { type: 'today' }
let lastForm: NurseryForm | null = null

const MAX_LOCAL = 8

export default function PlantScreen() {
  const params = useLocalSearchParams<{ id: string; speciesId?: string; speciesName?: string; speciesLatin?: string }>()
  const mapId = Number(params.id)
  // Coming from « Identifier »: the species Pl@ntNet found, maybe not yet in the map's list.
  const identified: CatalogueSpecies | null = params.speciesId ? { id: Number(params.speciesId), latinName: params.speciesLatin ?? '', commonName: params.speciesName ?? null, strata: null } : null
  const { bundle } = useMapBundle(mapId)
  const online = useOnline()
  const today = todayIso()
  const [fix, setFix] = useState<{ position: Position; accuracy: number | null } | null | 'none'>(null)
  const [query, setQuery] = useState('')
  const [species, setSpecies] = useState<CatalogueSpecies | null>(identified)
  const [catalogue, setCatalogue] = useState<CatalogueSpecies[]>([])
  const [searching, setSearching] = useState(false)
  const [variety, setVariety] = useState('')
  const [knownVarieties, setKnownVarieties] = useState<{ name: string }[]>([])
  const [form, setForm] = useState<NurseryForm | null>(lastForm)
  const [when, setWhen] = useState<PlantingWhen>(identified ? { type: 'planned' } : lastWhen)

  useEffect(() => { currentPositionWithAccuracy().then((f) => setFix(f ?? 'none')) }, [])

  const local = useMemo(() => speciesChoices(bundle?.planting, query), [bundle, query])

  // The whole catalogue, once two letters say what to look for.
  useEffect(() => {
    const q = query.trim()
    if (species || !online || q.length < 2) { setCatalogue([]); setSearching(false); return }
    const controller = new AbortController()
    setSearching(true)
    const timer = setTimeout(() => {
      api<{ results: CatalogueSpecies[] }>('GET', `/plants?q=${encodeURIComponent(q)}`, undefined, { signal: controller.signal })
        .then((r) => setCatalogue(r.results))
        .catch(() => setCatalogue([]))
        .finally(() => setSearching(false))
    }, 300)
    return () => { clearTimeout(timer); controller.abort() }
  }, [query, online, species])

  // The cultivars the catalogue knows for the chosen species.
  useEffect(() => {
    setKnownVarieties(species?.namedVarieties ?? [])
    if (!species || !online) return
    const controller = new AbortController()
    api<{ species: { varieties: { name: string }[] } }>('GET', `/plants/${species.id}`, undefined, { signal: controller.signal })
      .then((r) => setKnownVarieties(r.species.varieties ?? []))
      .catch(() => { /* the map's own cultivars still show */ })
    return () => controller.abort()
  }, [species, online])

  const fromCatalogue = catalogueOnly(catalogue, local)
  const suggestions = species ? varietySuggestions(species.id, bundle?.planting, knownVarieties, variety) : []
  const varietyName = cleanVariety(variety)

  const pick = (sp: CatalogueSpecies) => {
    setSpecies(sp)
    // A cultivar the search already named (« pommier reinette »).
    if (sp.namedVarieties?.length === 1) setVariety(sp.namedVarieties[0].name)
  }

  const save = () => {
    if (!fix || fix === 'none') return
    lastWhen = when
    lastForm = form
    const feature = {
      layer: 'plants', kind: 'plant',
      properties: {
        ...(species ? { species_id: species.id } : {}),
        ...plantingProperties(when, today),
        ...(form ? { nursery_form: form } : {}),
        ...gpsProperties(fix.accuracy),
      },
      geometry: { type: 'Point' as const, coordinates: fix.position },
      // Into the palette too, with the cultivar of the label.
      ...(species ? { palette: { ...(varietyName ? { variety_name: varietyName } : {}), ...(form ? { size: t(`mobile.plant.forms.${form}`) } : {}) } } : {}),
    }
    outbox.addFeature(mapId, feature)
    display.reveal(mapId, { layer: feature.layer, kind: feature.kind, ...feature.properties }, bundle?.planting)
    router.back()
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ padding: space.lg, gap: space.sm }} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
      {fix === null && <Notice>{t('mobile.plant.locating')}</Notice>}
      {fix === 'none' && <Notice tone="error">{t('mobile.plant.no_position')}</Notice>}
      {fix && fix !== 'none' && (
        <Notice tone={fix.accuracy && fix.accuracy > 10 ? 'warning' : 'info'}>
          {fix.accuracy ? t('mobile.plant.position', { accuracy: formatDistance(fix.accuracy) }) : t('mobile.plant.position_unknown_accuracy')}
        </Notice>
      )}

      <Label>{t('plant_feature.species')}</Label>
      {species ? (
        <View style={[s.row, s.rowSelected, s.chosen]}>
          <View style={{ flex: 1 }}>
            <Text style={s.name}>{species.commonName ?? species.latinName}</Text>
            {species.commonName ? <Text style={s.latin}>{species.latinName}</Text> : null}
          </View>
          <Button variant="secondary" label={t('mobile.plant.change_species')} onPress={() => { setSpecies(null); setVariety('') }} />
        </View>
      ) : (
        <>
          <Input value={query} onChangeText={setQuery} placeholder={t('mobile.plant.search')} autoCorrect={false} />
          {local.slice(0, MAX_LOCAL).map((item) => <SpeciesRow key={item.id} species={item} onPress={() => pick(item)} />)}
          {fromCatalogue.length > 0 && <Text style={s.group}>{t('mobile.plant.from_catalogue')}</Text>}
          {fromCatalogue.map((item) => <SpeciesRow key={`c${item.id}`} species={item} onPress={() => pick(item)} />)}
          {searching && <Body muted>{t('mobile.plant.searching')}</Body>}
          {!searching && local.length === 0 && fromCatalogue.length === 0 && (
            <Body muted>{query.trim().length < 2 ? t('mobile.plant.type_to_search') : online ? t('mobile.plant.no_match') : t('mobile.plant.offline_search')}</Body>
          )}
        </>
      )}

      {species && (
        <>
          <Label>{t('mobile.plant.variety')}</Label>
          <Input value={variety} onChangeText={setVariety} placeholder={t('mobile.plant.variety_placeholder')} autoCorrect={false} maxLength={120} />
          {suggestions.length > 0 && cleanVariety(variety) !== suggestions[0] && (
            <View style={s.chips}>
              {suggestions.map((name) => <Chip key={name} label={name} selected={name === varietyName} onPress={() => setVariety(name)} />)}
            </View>
          )}
          <Body muted>{t('mobile.plant.palette_hint')}</Body>
        </>
      )}

      <Label>{t('mobile.plant.form')}</Label>
      <View style={s.chips}>
        {NURSERY_FORMS.map((value) => (
          <Chip key={value} role="radio" label={t(`mobile.plant.forms.${value}`)} selected={form === value} onPress={() => setForm(form === value ? null : value)} />
        ))}
      </View>

      <Label>{t('mobile.plant.when.title')}</Label>
      <View style={s.chips}>
        <Chip role="radio" label={t('mobile.plant.when.planned')} selected={when.type === 'planned'} onPress={() => setWhen({ type: 'planned' })} />
        <Chip role="radio" label={t('mobile.plant.when.today')} selected={when.type === 'today'} onPress={() => setWhen({ type: 'today' })} />
        {pastYears(today).map((year) => (
          <Chip key={year} role="radio" label={t('mobile.plant.when.year', { year })} selected={when.type === 'year' && when.year === year} onPress={() => setWhen({ type: 'year', year })} />
        ))}
        <Chip role="radio" label={t('mobile.plant.when.unknown')} selected={when.type === 'unknown'} onPress={() => setWhen({ type: 'unknown' })} />
      </View>
      {when.type === 'planned' && <Body muted>{t('mobile.plant.when.planned_hint')}</Body>}

      <Button style={{ marginTop: space.md }} label={t('mobile.plant.save')} disabled={!fix || fix === 'none'} onPress={save} />
    </ScrollView>
  )
}

function SpeciesRow({ species, onPress }: { species: CatalogueSpecies; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={s.row}>
      <Text style={s.name}>{species.commonName ?? species.latinName}</Text>
      {species.commonName ? <Text style={s.latin}>{species.latinName}</Text> : null}
      {species.namedVarieties?.length ? <Text style={s.latin}>{species.namedVarieties.map((v) => `'${v.name}'`).join(', ')}</Text> : null}
    </Pressable>
  )
}

const s = StyleSheet.create({
  row: { paddingVertical: space.md, paddingHorizontal: space.md, borderRadius: radius.md, borderBottomWidth: 1, borderBottomColor: colors.loam100 },
  rowSelected: { backgroundColor: colors.prune50 },
  chosen: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  name: { fontSize: 16, fontFamily: fonts.medium, color: colors.loam900 },
  latin: { fontSize: 14, fontFamily: fonts.body, color: colors.loam600 },
  group: { fontSize: 14, fontFamily: fonts.medium, color: colors.loam600, marginTop: space.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
})
