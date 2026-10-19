// « Identifier »: one to five photos of one plant go to Pl@ntNet through
// Designer; the person picks the species, set on the selected plant or on
// a new plant where they stand. Each photo says what it shows (leaf,
// flower…), which helps Pl@ntNet. Needs the network.
import { router, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { ApiError, api, photosForm } from '@/lib/api'
import { featureTitle } from '@/lib/elements'
import { t } from '@/lib/i18n'
import { outbox } from '@/lib/outbox'
import { pickPhotos, takePhoto } from '@/lib/photos'
import { deletePhoto } from '@/lib/storage'
import { inPalette, nextOrgan, type Organ } from '@/lib/survey'
import type { IdentificationCandidate } from '@/lib/types'
import { useOnline } from '@/state/sync'
import { useMapBundle } from '@/state/useMapBundle'
import { Body, Button, Card, Notice, styles } from '@/ui/kit'
import { OrganChoice, OrganPhotos, organLists, type OrganPhoto } from '@/ui/OrganPhotos'
import { colors, fonts, space } from '@/ui/theme'

const MAX = 5

type Result = { candidates: IdentificationCandidate[]; credit: string }

export default function IdentifyScreen() {
  const params = useLocalSearchParams<{ id: string; featureId?: string }>()
  const mapId = Number(params.id)
  const featureId = params.featureId ? Number(params.featureId) : null
  const { bundle } = useMapBundle(mapId)
  const online = useOnline()
  const [photos, setPhotos] = useState<OrganPhoto[]>([])
  const [organ, setOrgan] = useState<Organ>('auto')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<Result | null>(null)
  const plant = featureId ? bundle?.features.find((f) => f.id === featureId) ?? null : null

  const add = (files: string[]) => setPhotos((current) => [...current, ...files.map((file) => ({ file, organ }))].slice(0, MAX))
  const remove = (file: string) => { deletePhoto(file); setPhotos((current) => current.filter((p) => p.file !== file)) }
  const cycle = (file: string) => setPhotos((current) => current.map((p) => (p.file === file ? { ...p, organ: nextOrgan(p.organ) } : p)))
  const forget = () => photos.forEach((p) => deletePhoto(p.file))
  const close = () => { forget(); router.back() }

  const identify = async () => {
    setBusy(true); setError(null); setResult(null)
    try {
      setResult(await api<Result>('POST', `/maps/${mapId}/plant_identifications`, photosForm('images[]', photos.map((p) => p.file), organLists(photos))))
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
        changes: { patch: { species_id: species.id } },
      })
      close()
    } else {
      // Where it stands, planted or already there: the person says so on the « Planter » screen.
      router.replace({ pathname: '/maps/[id]/plant', params: { id: String(mapId), speciesId: String(species.id), speciesName: species.commonName ?? species.latinName, speciesLatin: species.latinName } })
      forget()
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.content, { paddingBottom: 48 }]}>
      <Body>{plant ? t('mobile.identify.for_plant', { name: featureTitle(plant, bundle?.planting) }) : t('mobile.identify.new_plant')}</Body>
      <Body muted>{t('plantnet.section.intro')}</Body>
      {!online && <Notice tone="warning">{t('mobile.identify.offline')}</Notice>}

      {!result && <OrganChoice value={organ} onChange={setOrgan} />}
      <OrganPhotos photos={photos} onCycle={cycle} onRemove={remove} />
      {photos.length > 0 && <Body muted>{t('plantnet.section.count', { count: photos.length, max: MAX })}</Body>}

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
              {inPalette(candidate.species?.id, bundle?.planting?.palette) && <Text style={s.palette}>{t('mobile.organs.in_palette')}</Text>}
              <Text style={s.meta}>{t('plantnet.results.score', { percent: candidate.percent })}</Text>
              {candidate.commonNames.length > 0 && <Body muted>{t('plantnet.results.common_names', { names: candidate.commonNames.slice(0, 3).join(', ') })}</Body>}
              {candidate.species
                ? <Button style={{ marginTop: space.sm }} label={t('plantnet.results.choose')} onPress={() => choose(candidate)} />
                : <Body muted>{t('plantnet.results.not_in_catalogue')}</Body>}
            </Card>
          ))}
          <Body muted>{t('plantnet.results.hint')}</Body>
          <Button variant="secondary" label={t('plantnet.results.retry')} onPress={() => { forget(); setPhotos([]); setResult(null) }} />
          <Button variant="ghost" label={t('plantnet.results.none')} onPress={close} />
          <Text style={s.meta}>{t('plantnet.results.credit')}{result.credit}</Text>
        </>
      )}
    </ScrollView>
  )
}

const s = StyleSheet.create({
  section: { fontSize: 20, fontFamily: fonts.title, color: colors.loam900, marginTop: space.md },
  latin: { fontSize: 17, fontFamily: fonts.bold, color: colors.loam900 },
  meta: { fontSize: 14, fontFamily: fonts.body, color: colors.loam600 },
  palette: { alignSelf: 'flex-start', fontSize: 14, fontFamily: fonts.bold, color: colors.leaf700, backgroundColor: colors.leaf50, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, overflow: 'hidden' },
})
