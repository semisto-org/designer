// One photo of the map, large, with its date and caption. When it was taken
// again from the same spot, its series shows as a before/after to wipe
// across; an editor can take it once more (« Reprendre cette photo »).
import { router, Stack, useLocalSearchParams } from 'expo-router'
import { useMemo, useState } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { formatDate, t } from '@/lib/i18n'
import { elapsed, seriesOf } from '@/lib/retake'
import { canEdit } from '@/lib/types'
import { useMapBundle } from '@/state/useMapBundle'
import { BeforeAfter } from '@/ui/BeforeAfter'
import { Body, Button, Chip, MAX_FONT_SCALE, styles } from '@/ui/kit'
import { RemoteImage } from '@/ui/RemoteImage'
import { colors, radius, space, type } from '@/ui/theme'

export default function PhotoScreen() {
  const params = useLocalSearchParams<{ id: string; photoId: string }>()
  const mapId = Number(params.id)
  const photoId = Number(params.photoId)
  const { bundle } = useMapBundle(mapId)
  const photo = bundle?.photos.find((p) => p.id === photoId)
  const series = useMemo(() => (bundle && photo ? seriesOf(bundle.photos, photo) : []), [bundle, photo])
  const [beforeId, setBeforeId] = useState<number | null>(null)
  const [afterId, setAfterId] = useState<number | null>(null)

  if (!bundle || !photo) {
    return <View style={[styles.screen, styles.content]}><Body muted>{t('mobile.retake.gone')}</Body></View>
  }
  const before = series.find((p) => p.id === beforeId) ?? series[0]
  const after = series.find((p) => p.id === afterId) ?? series[series.length - 1]
  const retakable = canEdit(bundle.map) && photo.kind !== 'video'

  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.content, { paddingBottom: 48, gap: space.md }]}>
      <Stack.Screen options={{ title: formatDate(photo.takenAt) || t('mobile.retake.photo') }} />
      {series.length > 1 && before && after && before.id !== after.id ? (
        <>
          <Text style={s.hand} maxFontSizeMultiplier={MAX_FONT_SCALE}>
            {t('mobile.retake.series', { count: series.length, span: elapsed(series[0].takenAt, series[series.length - 1].takenAt) ?? '' })}
          </Text>
          <BeforeAfter mapId={mapId} before={before} after={after} />
          {series.length > 2 && (
            <>
              <Text style={s.label} maxFontSizeMultiplier={MAX_FONT_SCALE}>{t('mobile.retake.before')}</Text>
              <View style={s.chips}>
                {series.slice(0, -1).map((p) => <Chip key={p.id} label={formatDate(p.takenAt)} selected={p.id === before.id} role="radio"
                  onPress={() => { setBeforeId(p.id); if ((after.takenAt ?? '') <= (p.takenAt ?? '')) setAfterId(null) }} />)}
              </View>
              <Text style={s.label} maxFontSizeMultiplier={MAX_FONT_SCALE}>{t('mobile.retake.after')}</Text>
              <View style={s.chips}>
                {series.filter((p) => (p.takenAt ?? '') > (before.takenAt ?? '')).map((p) => <Chip key={p.id} label={formatDate(p.takenAt)} selected={p.id === after.id} role="radio"
                  onPress={() => setAfterId(p.id)} />)}
              </View>
            </>
          )}
        </>
      ) : (
        <RemoteImage path={`/maps/${mapId}/photos/${photo.id}/image?size=large`}
          style={[s.photo, { aspectRatio: photo.width && photo.height ? photo.width / photo.height : 3 / 4 }]} />
      )}
      {photo.caption ? <Body>{photo.caption}</Body> : null}
      {photo.uploadedBy ? <Body muted>{t('mobile.retake.by', { name: photo.uploadedBy })}</Body> : null}
      {retakable && (
        <>
          <Button icon="retake" label={t('mobile.retake.start')} onPress={() => router.push(`/maps/${mapId}/retake/${series[series.length - 1]?.id ?? photo.id}`)} />
          <Body muted>{t(series.length > 1 ? 'mobile.retake.start_hint_again' : 'mobile.retake.start_hint')}</Body>
        </>
      )}
    </ScrollView>
  )
}

const s = StyleSheet.create({
  photo: { width: '100%', borderRadius: radius.lg },
  hand: { ...type.hand, color: colors.prune700 },
  label: { ...type.label, color: colors.loam700, marginTop: space.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
})
