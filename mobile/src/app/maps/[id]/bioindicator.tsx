// « Plante bio-indicatrice »: photos of one wild plant go to Pl@ntNet
// through Designer; the person picks the species and its abundance, and
// the plant is noted where the photo was taken, the first photo with it.
// Identifying needs the network; the note itself goes through the outbox.
import { router, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { ApiError, api } from '@/lib/api'
import { t } from '@/lib/i18n'
import { currentPosition } from '@/lib/location'
import { outbox } from '@/lib/outbox'
import type { NewBioindicator } from '@/lib/outbox-core'
import { pickPhotos, takePhoto, type TakenPhoto } from '@/lib/photos'
import { deletePhoto } from '@/lib/storage'
import type { IdentificationCandidate } from '@/lib/types'
import { useOnline } from '@/state/sync'
import { Body, Button, Card, Chip, Input, Label, Notice, styles } from '@/ui/kit'
import { colors, fonts, radius, space } from '@/ui/theme'

const MAX = 5
const ABUNDANCES: NewBioindicator['abundance'][] = ['rare', 'present', 'frequent', 'dominant']

type Result = { candidates: IdentificationCandidate[]; credit: string }

const nameOf = (candidate: IdentificationCandidate) => candidate.bioindicator?.name ?? candidate.commonNames[0] ?? candidate.latinName

export default function BioindicatorScreen() {
  const mapId = Number(useLocalSearchParams<{ id: string }>().id)
  const online = useOnline()
  const [photos, setPhotos] = useState<TakenPhoto[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<Result | null>(null)
  const [chosen, setChosen] = useState<IdentificationCandidate | null>(null)
  const [abundance, setAbundance] = useState<NewBioindicator['abundance']>('present')
  const [notes, setNotes] = useState('')
  const position = photos[0]?.position ?? null

  const add = (taken: TakenPhoto[]) => setPhotos((current) => [...current, ...taken].slice(0, MAX))
  const remove = (photo: TakenPhoto) => { deletePhoto(photo.file); setPhotos((current) => current.filter((p) => p.file !== photo.file)) }
  const forget = () => { photos.forEach((p) => deletePhoto(p.file)); setPhotos([]); setResult(null); setChosen(null) }
  const close = () => { photos.forEach((p) => deletePhoto(p.file)); router.back() }

  const identify = async () => {
    setBusy(true); setError(null); setResult(null)
    try {
      const data = new FormData()
      photos.forEach((p, index) => data.append('images[]', { uri: p.file, name: `plant-${index + 1}.jpg`, type: 'image/jpeg' } as unknown as Blob))
      setResult(await api<Result>('POST', `/maps/${mapId}/plant_identifications`, data))
    } catch (e) {
      const apiError = e instanceof ApiError ? e : null
      setError(apiError?.offline ? t('plantnet.section.network_error') : String(apiError?.body?.message ?? t('plantnet.errors.unavailable')))
    } finally {
      setBusy(false)
    }
  }

  const save = async () => {
    if (!chosen || photos.length === 0) return
    const [kept, ...others] = photos
    const where = kept.position ?? await currentPosition()
    const name = nameOf(chosen)
    outbox.add({
      type: 'createBioindicator', mapId, photo: kept.file,
      observation: {
        speciesName: name, latinName: chosen.bioindicator?.latin ?? chosen.latinName, catalogKey: chosen.bioindicator?.key ?? null,
        plantSpeciesId: chosen.species?.id ?? null, abundance, notes: notes.trim() || null,
        lng: where?.[0] ?? null, lat: where?.[1] ?? null, takenAt: kept.takenAt,
      },
    })
    others.forEach((p) => deletePhoto(p.file))
    Alert.alert(t('mobile.bioindicator.title'), t('mobile.bioindicator.saved', { name }))
    router.back()
  }

  if (chosen) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={[styles.content, { paddingBottom: 48 }]} keyboardShouldPersistTaps="handled">
        <Card style={{ gap: space.xs }}>
          <Text style={s.name}>{nameOf(chosen)}</Text>
          <Text style={s.latin}>{chosen.bioindicator?.latin ?? chosen.latinName}</Text>
          <Indicators candidate={chosen} />
        </Card>
        <Label>{t('mobile.bioindicator.abundance')}</Label>
        <View style={s.chips}>
          {ABUNDANCES.map((a) => <Chip key={a} label={t(`soil.abundances.${a}`)} selected={abundance === a} onPress={() => setAbundance(a)} />)}
        </View>
        <Label>{t('mobile.bioindicator.notes')}</Label>
        <Input value={notes} onChangeText={setNotes} maxLength={500} />
        <Notice tone={position ? 'info' : 'warning'}>{position ? t('mobile.bioindicator.position') : t('mobile.bioindicator.no_position')}</Notice>
        <Button label={t('mobile.bioindicator.save')} onPress={save} />
        <Button variant="ghost" label={t('mobile.bioindicator.back')} onPress={() => setChosen(null)} />
      </ScrollView>
    )
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.content, { paddingBottom: 48 }]}>
      <Body muted>{t('mobile.bioindicator.intro')}</Body>
      {!online && <Notice tone="warning">{t('mobile.bioindicator.offline')}</Notice>}

      {photos.length > 0 && (
        <View style={s.photos}>
          {photos.map((photo, index) => (
            <Pressable key={photo.file} onLongPress={() => remove(photo)} accessibilityLabel={t('plantnet.section.photo_alt', { index: index + 1 })}
              accessibilityHint={t('plantnet.section.remove')}>
              <Image source={{ uri: photo.file }} style={[s.photo, index === 0 && s.kept]} />
            </Pressable>
          ))}
        </View>
      )}
      {photos.length > 0 && <Body muted>{t('mobile.bioindicator.kept')} · {t('mobile.identify.remove_hint')}</Body>}

      {photos.length < MAX && !result && (
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          <Button style={{ flex: 1 }} variant="secondary" label={t('plantnet.section.take')} onPress={async () => { const p = await takePhoto(); if (p) add([p]) }} />
          <Button style={{ flex: 1 }} variant="secondary" label={t('plantnet.section.choose')} onPress={async () => add(await pickPhotos(MAX - photos.length))} />
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
              <Text style={s.name}>{nameOf(candidate)}</Text>
              <Text style={s.latin}>{candidate.latinName} · {t('plantnet.results.score', { percent: candidate.percent })}</Text>
              <Indicators candidate={candidate} />
              <Button style={{ marginTop: space.sm }} label={t('plantnet.results.choose')} onPress={() => setChosen(candidate)} />
            </Card>
          ))}
          <Button variant="secondary" label={t('plantnet.results.retry')} onPress={forget} />
          <Button variant="ghost" label={t('plantnet.results.none')} onPress={close} />
          <Text style={s.meta}>{t('plantnet.results.credit')}{result.credit}</Text>
        </>
      )}
    </ScrollView>
  )
}

/** What the plant says about the soil, in words; or that the list does not know it. */
function Indicators({ candidate }: { candidate: IdentificationCandidate }) {
  const entry = candidate.bioindicator
  if (!entry) return <Body muted>{t('mobile.bioindicator.not_in_list')}</Body>
  return (
    <View style={{ gap: space.xs }}>
      <Text style={s.inList}>{t('mobile.bioindicator.in_list')}</Text>
      <View style={s.chips}>
        {entry.indicates.map((key) => (
          <Text key={key} style={[s.indicator, entry.unverified.includes(key) && s.unverified]}>
            {t(`soil.indicators.${key}.label`)}{entry.unverified.includes(key) ? ' ?' : ''}
          </Text>
        ))}
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  photos: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  photo: { width: 96, height: 96, borderRadius: radius.md, backgroundColor: colors.loam100 },
  kept: { borderWidth: 3, borderColor: colors.prune600 },
  section: { fontSize: 20, fontFamily: fonts.title, color: colors.loam900, marginTop: space.md },
  name: { fontSize: 17, fontFamily: fonts.bold, color: colors.loam900 },
  latin: { fontSize: 13, fontFamily: fonts.body, color: colors.loam600 },
  meta: { fontSize: 13, fontFamily: fonts.body, color: colors.loam600 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  inList: { fontSize: 13, fontFamily: fonts.bold, color: colors.prune700 },
  indicator: { fontSize: 12, fontFamily: fonts.medium, color: colors.loam900, backgroundColor: colors.loam100, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, overflow: 'hidden' },
  unverified: { backgroundColor: colors.white, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.loam500 },
})
