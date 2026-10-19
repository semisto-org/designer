// One photo of the map, large, with its date and caption. When it was taken
// again from the same spot, its series shows as a before/after to wipe
// across; an editor can take it once more (« Reprendre cette photo »).
// Its sketches (drawn here or on the computer) lay over it one at a time;
// an editor draws a new one or changes the one shown (« Esquisser »).
import { router, Stack, useLocalSearchParams } from 'expo-router'
import { useMemo, useState } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { formatDate, t } from '@/lib/i18n'
import { elapsed, seriesOf } from '@/lib/retake'
import { canEdit } from '@/lib/types'
import { useMapBundle } from '@/state/useMapBundle'
import { useSketches } from '@/state/useSketches'
import { useOnline } from '@/state/sync'
import { BeforeAfter } from '@/ui/BeforeAfter'
import { Body, Button, Chip, MAX_FONT_SCALE, styles } from '@/ui/kit'
import { RemoteImage } from '@/ui/RemoteImage'
import { SketchLayer } from '@/ui/SketchLayer'
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
  const isImage = !!photo && photo.kind !== 'video'
  const { sketches } = useSketches(mapId, photoId, isImage)
  const [sketchId, setSketchId] = useState<number | null>(null)
  const [frameWidth, setFrameWidth] = useState(0)
  const online = useOnline()

  if (!bundle || !photo) {
    return <View style={[styles.screen, styles.content]}><Body muted>{t('mobile.retake.gone')}</Body></View>
  }
  const before = series.find((p) => p.id === beforeId) ?? series[0]
  const after = series.find((p) => p.id === afterId) ?? series[series.length - 1]
  const retakable = canEdit(bundle.map) && isImage
  const sketch = sketches.find((k) => k.id === sketchId) ?? null
  const aspect = photo.width && photo.height ? photo.width / photo.height : 3 / 4

  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.content, { paddingBottom: 48, gap: space.md }]}>
      <Stack.Screen options={{ title: formatDate(photo.takenAt) || t('mobile.retake.photo') }} />
      {!sketch && series.length > 1 && before && after && before.id !== after.id ? (
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
        <View style={[s.photo, { aspectRatio: aspect }]} onLayout={(event) => setFrameWidth(event.nativeEvent.layout.width)}>
          <RemoteImage path={`/maps/${mapId}/photos/${photo.id}/image?size=large`} style={{ width: '100%', height: '100%' }} />
          {sketch && <SketchLayer marks={sketch.strokes} width={frameWidth} height={frameWidth / aspect} />}
        </View>
      )}
      {sketches.length > 0 && (
        <>
          <Text style={s.label} maxFontSizeMultiplier={MAX_FONT_SCALE}>{t('photo_sketches.list_label')}</Text>
          <View style={s.chips}>
            <Chip label={t('photo_sketches.none')} selected={!sketch} role="radio" onPress={() => setSketchId(null)} />
            {sketches.map((k) => <Chip key={k.id} label={k.name} selected={k.id === sketch?.id} role="radio" onPress={() => setSketchId(k.id)} />)}
          </View>
          {sketch?.createdBy ? <Body muted>{t('photo_sketches.by', { name: sketch.createdBy })}</Body> : null}
        </>
      )}
      {photo.caption ? <Body>{photo.caption}</Body> : null}
      {photo.uploadedBy ? <Body muted>{t('mobile.retake.by', { name: photo.uploadedBy })}</Body> : null}
      {retakable && (
        <>
          <Button icon="retake" label={t('mobile.retake.start')} onPress={() => router.push(`/maps/${mapId}/retake/${series[series.length - 1]?.id ?? photo.id}`)} />
          <Body muted>{t(series.length > 1 ? 'mobile.retake.start_hint_again' : 'mobile.retake.start_hint')}</Body>
          <Button variant="secondary" icon="sketch" label={t(sketch ? 'mobile.sketch.edit' : 'mobile.sketch.start')} disabled={!online}
            onPress={() => router.push(sketch ? `/maps/${mapId}/sketch/${photo.id}?sketchId=${sketch.id}` : `/maps/${mapId}/sketch/${photo.id}`)} />
          <Body muted>{online ? t('mobile.sketch.start_hint') : t('mobile.sketch.offline')}</Body>
        </>
      )}
    </ScrollView>
  )
}

const s = StyleSheet.create({
  photo: { width: '100%', borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.loam100 },
  hand: { ...type.hand, color: colors.prune700 },
  label: { ...type.label, color: colors.loam700, marginTop: space.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
})
