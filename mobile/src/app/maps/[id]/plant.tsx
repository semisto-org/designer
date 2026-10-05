// « Planter »: a new plant where the phone stands, with its species from
// the map's palette, planted today or still to plant.
import { router, useLocalSearchParams } from 'expo-router'
import { useEffect, useMemo, useState } from 'react'
import { FlatList, Pressable, StyleSheet, Switch, Text, View } from 'react-native'
import { gpsProperties } from '@/lib/geo'
import { formatDistance, t, todayIso } from '@/lib/i18n'
import { currentPositionWithAccuracy } from '@/lib/location'
import { outbox } from '@/lib/outbox'
import { speciesChoices } from '@/lib/species'
import type { Position } from '@/lib/types'
import { useMapBundle } from '@/state/useMapBundle'
import { Body, Button, Input, Label, Notice, styles } from '@/ui/kit'
import { colors, fonts, radius, space } from '@/ui/theme'

export default function PlantScreen() {
  const params = useLocalSearchParams<{ id: string; speciesId?: string; speciesName?: string; speciesLatin?: string }>()
  const mapId = Number(params.id)
  // Coming from « Identifier »: the species Pl@ntNet found, maybe not yet in the map's list.
  const identified = params.speciesId ? { id: Number(params.speciesId), latinName: params.speciesLatin ?? '', commonName: params.speciesName ?? null, strata: null } : null
  const { bundle } = useMapBundle(mapId)
  const [fix, setFix] = useState<{ position: Position; accuracy: number | null } | null | 'none'>(null)
  const [query, setQuery] = useState('')
  const [speciesId, setSpeciesId] = useState<number | null>(identified?.id ?? null)
  const [plantedToday, setPlantedToday] = useState(!identified)

  useEffect(() => { currentPositionWithAccuracy().then((f) => setFix(f ?? 'none')) }, [])

  const choices = useMemo(() => {
    const list = speciesChoices(bundle?.planting, query)
    return identified && !list.some((sp) => sp.id === identified.id) ? [identified, ...list] : list
  }, [bundle, query]) // eslint-disable-line react-hooks/exhaustive-deps

  const save = () => {
    if (!fix || fix === 'none') return
    outbox.addFeature(mapId, {
      layer: 'plants', kind: 'plant',
      properties: { ...(speciesId ? { species_id: speciesId } : {}), ...(plantedToday ? { planted_on: todayIso() } : {}), ...gpsProperties(fix.accuracy) },
      geometry: { type: 'Point', coordinates: fix.position },
    })
    router.back()
  }

  return (
    <View style={[styles.screen, { padding: space.lg, gap: space.sm }]}>
      {fix === null && <Notice>{t('mobile.plant.locating')}</Notice>}
      {fix === 'none' && <Notice tone="error">{t('mobile.plant.no_position')}</Notice>}
      {fix && fix !== 'none' && (
        <Notice tone={fix.accuracy && fix.accuracy > 10 ? 'warning' : 'info'}>
          {fix.accuracy ? t('mobile.plant.position', { accuracy: formatDistance(fix.accuracy) }) : t('mobile.plant.position_unknown_accuracy')}
        </Notice>
      )}

      <Label>{t('plant_feature.species')}</Label>
      <Input value={query} onChangeText={setQuery} placeholder={t('mobile.plant.search')} autoCorrect={false} />
      <FlatList
        style={{ flex: 1 }}
        data={choices}
        keyExtractor={(item) => String(item.id)}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={<Body muted>{t('mobile.plant.no_match')}</Body>}
        renderItem={({ item }) => (
          <Pressable onPress={() => setSpeciesId(speciesId === item.id ? null : item.id)} accessibilityRole="radio" accessibilityState={{ selected: speciesId === item.id }}
            style={[s.row, speciesId === item.id && s.rowSelected]}>
            <Text style={s.name}>{item.commonName ?? item.latinName}</Text>
            {item.commonName ? <Text style={s.latin}>{item.latinName}</Text> : null}
          </Pressable>
        )}
      />
      <View style={s.toggle}>
        <Text style={s.toggleLabel}>{t('mobile.plant.planted_today')}</Text>
        <Switch value={plantedToday} onValueChange={setPlantedToday} trackColor={{ true: colors.prune600 }} />
      </View>
      <Button label={t('mobile.plant.save')} disabled={!fix || fix === 'none'} onPress={save} />
    </View>
  )
}

const s = StyleSheet.create({
  row: { paddingVertical: space.md, paddingHorizontal: space.md, borderRadius: radius.md, borderBottomWidth: 1, borderBottomColor: colors.loam100 },
  rowSelected: { backgroundColor: colors.prune50 },
  name: { fontSize: 16, fontFamily: fonts.medium, color: colors.loam900 },
  latin: { fontSize: 13, fontFamily: fonts.body, color: colors.loam600 },
  toggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: space.sm },
  toggleLabel: { fontSize: 16, fontFamily: fonts.body, color: colors.loam900 },
})
