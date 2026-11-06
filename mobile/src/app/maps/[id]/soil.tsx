// « Points de sol »: the soil sampling points placed on the website, nearest
// first, to photograph each one in the field (the hole, the core laid on the
// ground, the profile). At least one photo is always taken per point: it is
// the only memory of how the soil looked that day. Photos go through the
// outbox, offline too, linked to their point.
import { router, useLocalSearchParams } from 'expo-router'
import { useEffect, useMemo, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { formatDate, formatDistance, t } from '@/lib/i18n'
import { currentPosition } from '@/lib/location'
import { outbox } from '@/lib/outbox'
import { metersTo, nearestFirst, photosOf } from '@/lib/soil'
import { keptFile } from '@/lib/storage'
import { canEdit, type Position, type SoilSample } from '@/lib/types'
import { useOutbox } from '@/state/sync'
import { useMapBundle } from '@/state/useMapBundle'
import { chooseMedia } from '@/ui/chooseMedia'
import { Body, Button, Card, Notice, styles } from '@/ui/kit'
import { RemoteImage } from '@/ui/RemoteImage'
import { colors, fonts, radius, space, type } from '@/ui/theme'

export default function SoilScreen() {
  const mapId = Number(useLocalSearchParams<{ id: string }>().id)
  const { bundle } = useMapBundle(mapId)
  const ops = useOutbox().ops.filter((op) => op.mapId === mapId)
  const [here, setHere] = useState<Position | null>(null)

  useEffect(() => { currentPosition().then(setHere).catch(() => setHere(null)) }, [])

  const samples = useMemo(() => nearestFirst(bundle?.soilSamples ?? [], here), [bundle?.soilSamples, here])
  if (!bundle) return <View style={[styles.screen, styles.content]} />
  const editable = canEdit(bundle.map)

  const add = async (sample: SoilSample) => {
    const choice = await chooseMedia()
    for (const item of choice?.items ?? []) {
      // A photo without GPS is placed on its point.
      const position = item.position ?? (sample.lng != null && sample.lat != null ? [sample.lng, sample.lat] as Position : null)
      outbox.add({
        type: 'uploadPhoto', mapId, file: item.file, takenAt: item.takenAt, lng: position?.[0] ?? null, lat: position?.[1] ?? null,
        featureId: null, heading: item.heading ?? null, soilSampleId: sample.id,
      })
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.content, { paddingBottom: 48 }]}>
      <Text style={s.hand}>{t('mobile.soil.always')}</Text>
      <Body muted>{t('mobile.soil.intro')}</Body>
      {samples.length === 0 && <Notice>{t('mobile.soil.none')}</Notice>}
      {samples.map((sample) => {
        const photos = photosOf(bundle.photos, sample)
        const pending = ops.flatMap((op) => (op.type === 'uploadPhoto' && op.soilSampleId === sample.id ? [keptFile(op.file) ?? op.file] : []))
        const away = metersTo(here, sample)
        const count = photos.length + pending.length
        return (
          <Card key={sample.id} style={{ gap: space.sm }}>
            <View style={s.head}>
              <Text style={s.title}>{sample.label}</Text>
              {away != null && <Text style={s.meta}>{formatDistance(away)}</Text>}
            </View>
            <Text style={s.meta}>
              {[
                sample.status === 'sampled' && sample.sampledOn ? t('mobile.soil.sampled_on', { date: formatDate(sample.sampledOn) }) : t(`mobile.soil.status.${sample.status}`),
                t('mobile.soil.depth', { from: sample.depthFromCm, to: sample.depthToCm }),
              ].join(' · ')}
            </Text>
            {count > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
                {pending.map((file) => <RemoteImage key={file} local={file} style={s.thumb} />)}
                {photos.map((photo) => (
                  <Pressable key={photo.id} onPress={() => router.push(`/maps/${mapId}/photo/${photo.id}`)}
                    accessibilityRole="button" accessibilityLabel={t('mobile.soil.open_photo', { date: formatDate(photo.takenAt) })}>
                    <RemoteImage path={`/maps/${mapId}/photos/${photo.id}/image?size=thumb`} style={s.thumb} />
                  </Pressable>
                ))}
              </ScrollView>
            ) : (
              <Body muted>{t('mobile.soil.no_photo')}</Body>
            )}
            {pending.length > 0 && <Body muted>{t('mobile.soil.pending', { count: pending.length })}</Body>}
            {editable && <Button variant={count === 0 ? 'primary' : 'secondary'} label={t('mobile.soil.add_photo')} onPress={() => add(sample)} />}
          </Card>
        )
      })}
    </ScrollView>
  )
}

const s = StyleSheet.create({
  hand: { ...type.hand, color: colors.prune700 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: space.sm },
  title: { fontSize: 18, fontFamily: fonts.title, color: colors.loam900, flexShrink: 1 },
  meta: { fontSize: 14, fontFamily: fonts.body, color: colors.loam600 },
  thumb: { width: 96, height: 96, borderRadius: radius.md },
})
