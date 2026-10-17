// « Affichage »: what the terrain map shows. By default the existing only,
// since on the ground the phone records what is there; the project comes
// back with one switch. Layers and plant strata can be hidden, like in
// « Calques » on the website. Kept per map on the phone.
import { useLocalSearchParams } from 'expo-router'
import { useMemo } from 'react'
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native'
import { display, useDisplay } from '@/lib/display'
import { census, hidesMore, toggle, UNKNOWN_STRATA } from '@/lib/display-core'
import { LAYERS, layerLabel } from '@/lib/elements'
import { has, t } from '@/lib/i18n'
import { useMapBundle } from '@/state/useMapBundle'
import { Body, Button, Chip, Label, styles } from '@/ui/kit'
import { colors, fonts, space } from '@/ui/theme'

// Tallest first, like the strata legend on the website.
const STRATA_ORDER = ['canopy', 'sub_canopy', 'shrub', 'herbaceous', 'ground_cover', 'vine', 'root', 'aquatic', UNKNOWN_STRATA]

export default function DisplayScreen() {
  const mapId = Number(useLocalSearchParams<{ id: string }>().id)
  const { bundle } = useMapBundle(mapId)
  const shown = useDisplay(mapId)
  const counts = useMemo(() => census(bundle?.features ?? [], bundle?.planting), [bundle])
  const layers = LAYERS.filter((layer) => counts.layers[layer])
  const strata = STRATA_ORDER.filter((key) => counts.strata[key]).concat(Object.keys(counts.strata).filter((key) => !STRATA_ORDER.includes(key)))
  const strataLabel = (key: string) => (key !== UNKNOWN_STRATA && has(`plants.strata.${key}`) ? t(`plants.strata.${key}`) : t('mobile.display.unknown_strata'))

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={s.row}>
        <Text style={s.rowLabel}>{t('mobile.display.projected')}</Text>
        <Switch value={shown.projected} onValueChange={(projected) => display.set(mapId, { ...shown, projected })} trackColor={{ true: colors.prune600 }} />
      </View>
      <Body muted>{t('mobile.display.projected_hint')}</Body>
      <Body muted>{counts.projected ? t('mobile.display.projected_count', { count: counts.projected }) : t('mobile.display.projected_none')}</Body>

      {layers.length > 0 && <Label>{t('mobile.display.layers')}</Label>}
      {layers.map((layer) => (
        <View key={layer} style={s.row}>
          <View style={{ flex: 1 }}>
            <Text style={s.rowLabel}>{layerLabel(layer)}</Text>
            <Text style={s.rowSub}>{t('mobile.display.count', { count: counts.layers[layer] })}</Text>
          </View>
          <Switch value={!shown.hiddenLayers.includes(layer)} trackColor={{ true: colors.prune600 }}
            onValueChange={() => display.set(mapId, { ...shown, hiddenLayers: toggle(shown.hiddenLayers, layer) })} />
        </View>
      ))}

      {strata.length > 0 && !shown.hiddenLayers.includes('plants') && (
        <>
          <Label>{t('mobile.display.strata')}</Label>
          <Body muted>{t('mobile.display.strata_hint')}</Body>
          <View style={s.chips}>
            {strata.map((key) => (
              <Chip key={key} label={`${strataLabel(key)} (${counts.strata[key]})`} selected={!shown.hiddenStrata.includes(key)}
                onPress={() => display.set(mapId, { ...shown, hiddenStrata: toggle(shown.hiddenStrata, key) })} />
            ))}
          </View>
        </>
      )}

      {hidesMore(shown) && (
        <Button variant="ghost" label={t('mobile.display.show_all')}
          onPress={() => display.set(mapId, { ...shown, hiddenLayers: [], hiddenStrata: [] })} />
      )}
      <Body muted style={{ marginTop: space.md }}>{t('mobile.display.remembered')}</Body>
    </ScrollView>
  )
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md, paddingVertical: space.xs },
  rowLabel: { fontSize: 16, fontFamily: fonts.body, color: colors.loam900 },
  rowSub: { fontSize: 14, fontFamily: fonts.body, color: colors.loam500 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
})
