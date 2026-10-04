// « Identifier »: one to five photos of one plant go to Pl@ntNet through
// Designer; the person picks the species, set on the selected plant or on
// a new plant where they stand. Needs the network.
import { router, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { ApiError, api } from '@/lib/api'
import { featureTitle } from '@/lib/elements'
import { t } from '@/lib/i18n'
import { outbox } from '@/lib/outbox'
import { ownProperties } from '@/lib/outbox-core'
import { pickPhotos, takePhoto } from '@/lib/photos'
import { deletePhoto } from '@/lib/storage'
import type { IdentificationCandidate } from '@/lib/types'
import { useOnline } from '@/state/sync'
import { useMapBundle } from '@/state/useMapBundle'
import { Body, Button, Card, Notice, styles } from '@/ui/kit'
import { colors, fonts, radius, space } from '@/ui/theme'

const MAX = 5

type Result = { candidates: IdentificationCandidate[]; credit: string }

export default function IdentifyScreen() {
  const params = useLocalSearchParams<{ id: string; featureId?: string }>()
  const mapId = Number(params.id)
  const featureId = params.featureId ? Number(params.featureId) : null
  const { bundle } = useMapBundle(mapId)
  const online = useOnline()
  const [photos, setPhotos] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<Result | null>(null)
  const plant = featureId ? bundle?.features.find((f) => f.id === featureId) ?? null : null

  const add = (files: string[]) => setPhotos((current) => [...current, ...files].slice(0, MAX))
  const remove = (file: string) => { deletePhoto(file); setPhotos((current) => current.filter((f) => f !== file)) }
  const close = () => { photos.forEach(deletePhoto); router.back() }

  const identify = async () => {
    setBusy(true); setError(null); setResult(null)
    try {
      const data = new FormData()
      photos.forEach((uri, index) => data.append('images[]', { uri, name: `plant-${index + 1}.jpg`, type: 'image/jpeg' } as unknown as Blob))
      setResult(await api<Result>('POST', `/maps/${mapId}/plant_identifications`, data))
    } catch (e) {
      const apiError = e instanceof ApiError ? e : null
      setError(apiError?.offline ? t('plantnet.section.network_error') : String(apiError?.body?.message ?? t('plantnet.errors.unavailable')))
    } finally {
      setBusy(false)
    }
  }

  const choose = (candidate: IdentificationCandidate) => {
    const species = candidate.species
    if (!species) return
    if (plant) {
      outbox.add({
        type: 'updateFeature', mapId, featureId: plant.id, lockVersion: plant.properties.lockVersion,
        changes: { properties: { ...ownProperties(plant.properties), species_id: species.id } },
      })
      close()
    } else {
      // Where it stands, planted or already there: the person says so on the « Planter » screen.
      router.replace({ pathname: '/maps/[id]/plant', params: { id: String(mapId), speciesId: String(species.id), speciesName: species.commonName ?? species.latinName, speciesLatin: species.latinName } })
      photos.forEach(deletePhoto)
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.content, { paddingBottom: 48 }]}>
      <Body>{plant ? t('mobile.identify.for_plant', { name: featureTitle(plant, bundle?.planting) }) : t('mobile.identify.new_plant')}</Body>
      <Body muted>{t('plantnet.section.intro')}</Body>
      {!online && <Notice tone="warning">{t('mobile.identify.offline')}</Notice>}

      {photos.length > 0 && (
        <View style={s.photos}>
          {photos.map((file, index) => (
            <Pressable key={file} onLongPress={() => remove(file)} accessibilityLabel={t('plantnet.section.photo_alt', { index: index + 1 })}
              accessibilityHint={t('plantnet.section.remove')}>
              <Image source={{ uri: file }} style={s.photo} />
            </Pressable>
          ))}
        </View>
      )}
      {photos.length > 0 && <Body muted>{t('plantnet.section.count', { count: photos.length, max: MAX })} · {t('mobile.identify.remove_hint')}</Body>}

      {photos.length < MAX && !result && (
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          <Button style={{ flex: 1 }} variant="secondary" label={t('plantnet.section.take')} onPress={async () => { const p = await takePhoto(); if (p) add([p.file]) }} />
          <Button style={{ flex: 1 }} variant="secondary" label={t('plantnet.section.choose')} onPress={async () => add((await pickPhotos(MAX - photos.length)).map((p) => p.file))} />
        </View>
      )}
      {!result && <Button label={busy ? t('plantnet.section.identifying') : t('plantnet.section.identify')} busy={busy} disabled={!online || photos.length === 0} onPress={identify} />}
      {error && <Notice tone="error">{error}</Notice>}

      {result && (
        <>
          <Text style={s.section}>{t('plantnet.results.title')}</Text>
          {result.candidates.length === 0 && <Body muted>{t('plantnet.results.empty')}</Body>}
          {result.candidates.map((candidate) => (
            <Card key={candidate.latinName} style={{ gap: space.xs }}>
              <Text style={s.latin}>{candidate.latinName}</Text>
              <Text style={s.meta}>{t('plantnet.results.score', { percent: candidate.percent })}</Text>
              {candidate.commonNames.length > 0 && <Body muted>{t('plantnet.results.common_names', { names: candidate.commonNames.slice(0, 3).join(', ') })}</Body>}
              {candidate.species
                ? <Button style={{ marginTop: space.sm }} label={t('plantnet.results.choose')} onPress={() => choose(candidate)} />
                : <Body muted>{t('plantnet.results.not_in_catalogue')}</Body>}
            </Card>
          ))}
          <Body muted>{t('plantnet.results.hint')}</Body>
          <Button variant="secondary" label={t('plantnet.results.retry')} onPress={() => { photos.forEach(deletePhoto); setPhotos([]); setResult(null) }} />
          <Button variant="ghost" label={t('plantnet.results.none')} onPress={close} />
          <Text style={s.meta}>{t('plantnet.results.credit')}{result.credit}</Text>
        </>
      )}
    </ScrollView>
  )
}

const s = StyleSheet.create({
  photos: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  photo: { width: 96, height: 96, borderRadius: radius.md, backgroundColor: colors.loam100 },
  section: { fontSize: 20, fontFamily: fonts.title, color: colors.loam900, marginTop: space.md },
  latin: { fontSize: 17, fontFamily: fonts.bold, color: colors.loam900 },
  meta: { fontSize: 13, fontFamily: fonts.body, color: colors.loam600 },
})
