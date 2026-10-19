// « Plante bio-indicatrice »: photos of a patch of wild plants are left for
// the person's own AI, which reads the whole photo through the MCP and
// proposes each plant it sees (reviewed on the website); they go through the
// outbox, offline too. For one plant seen up close, the photos can instead go
// to Pl@ntNet through Designer: the person picks the species and its
// abundance, and the plant is noted where the photo was taken, the first
// photo with it. Identifying needs the network; the note goes through the outbox.
// Each photo says which organ it shows, each plant the share of the patch it
// covers; the screen stays open for the next plant, and the plants noted so
// far add up to a reading of the soil, weighted by their cover.
import { router, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { ApiError, api, photosForm } from '@/lib/api'
import { t } from '@/lib/i18n'
import { currentPosition } from '@/lib/location'
import { outbox } from '@/lib/outbox'
import { pickPhotos, takePhoto, type TakenPhoto } from '@/lib/photos'
import { deletePhoto } from '@/lib/storage'
import { abundanceForCover, COVERS, coverPercent, inPalette, nextOrgan, surveyReading, type CoverKey, type NotedPlant, type Organ } from '@/lib/survey'
import type { IdentificationCandidate } from '@/lib/types'
import { useOnline } from '@/state/sync'
import { useMapBundle } from '@/state/useMapBundle'
import { Body, Button, Card, Chip, Input, Label, Notice, styles } from '@/ui/kit'
import { OrganChoice, OrganPhotos, organLists } from '@/ui/OrganPhotos'
import { toast } from '@/ui/Toast'
import { colors, fonts, space } from '@/ui/theme'

const MAX = 5
const READING_LINES = 3

type Result = { candidates: IdentificationCandidate[]; credit: string }

const nameOf = (candidate: IdentificationCandidate) => candidate.bioindicator?.name ?? candidate.commonNames[0] ?? candidate.latinName

export default function BioindicatorScreen() {
  const mapId = Number(useLocalSearchParams<{ id: string }>().id)
  const online = useOnline()
  const { bundle } = useMapBundle(mapId)
  const palette = bundle?.planting?.palette
  const [photos, setPhotos] = useState<(TakenPhoto & { organ: Organ })[]>([])
  const [organ, setOrgan] = useState<Organ>('auto')
  const [noted, setNoted] = useState<NotedPlant[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<Result | null>(null)
  const [chosen, setChosen] = useState<IdentificationCandidate | null>(null)
  const [cover, setCover] = useState<CoverKey>('to_25')
  const [notes, setNotes] = useState('')
  const position = photos[0]?.position ?? null

  const add = (taken: TakenPhoto[]) => setPhotos((current) => [...current, ...taken.map((p) => ({ ...p, organ }))].slice(0, MAX))
  const remove = (file: string) => { deletePhoto(file); setPhotos((current) => current.filter((p) => p.file !== file)) }
  const cycle = (file: string) => setPhotos((current) => current.map((p) => (p.file === file ? { ...p, organ: nextOrgan(p.organ) } : p)))
  const forget = () => { photos.forEach((p) => deletePhoto(p.file)); setPhotos([]); setResult(null); setChosen(null) }
  const close = () => { photos.forEach((p) => deletePhoto(p.file)); router.back() }

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

  // Every photo goes to the map's photos, marked for the AI to read.
  const leaveForAi = () => {
    photos.forEach((p) => outbox.add({
      type: 'uploadPhoto', mapId, file: p.file, takenAt: p.takenAt, featureId: null, bioindicatorStatus: 'to_analyze',
      lng: p.position?.[0] ?? null, lat: p.position?.[1] ?? null,
    }))
    toast(t('mobile.bioindicator.title'), { body: t('mobile.bioindicator.ai_saved', { count: photos.length }) })
    router.back()
  }

  const save = async () => {
    if (!chosen || photos.length === 0) return
    const [kept, ...others] = photos
    const where = kept.position ?? await currentPosition()
    const name = nameOf(chosen)
    const percent = coverPercent(cover)
    outbox.add({
      type: 'createBioindicator', mapId, photo: kept.file,
      observation: {
        speciesName: name, latinName: chosen.bioindicator?.latin ?? chosen.latinName, catalogKey: chosen.bioindicator?.key ?? null,
        plantSpeciesId: chosen.species?.id ?? null, abundance: abundanceForCover(percent), coverPercent: percent, notes: notes.trim() || null,
        lng: where?.[0] ?? null, lat: where?.[1] ?? null, takenAt: kept.takenAt,
      },
    })
    others.forEach((p) => deletePhoto(p.file))
    setNoted((current) => [...current, { name, coverPercent: percent, indicates: chosen.bioindicator?.indicates ?? [], unverified: chosen.bioindicator?.unverified ?? [] }])
    // The screen stays open for the next plant of the same patch.
    setPhotos([]); setResult(null); setChosen(null); setNotes(''); setCover('to_25'); setOrgan('auto')
    toast(t('mobile.bioindicator.title'), { body: t('mobile.bioindicator.saved_next', { name }) })
  }

  if (chosen) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={[styles.content, { paddingBottom: 48 }]} keyboardShouldPersistTaps="handled">
        <Card style={{ gap: space.xs }}>
          <Text style={s.name}>{nameOf(chosen)}</Text>
          <Text style={s.latin}>{chosen.bioindicator?.latin ?? chosen.latinName}</Text>
          {inPalette(chosen.species?.id, palette) && <Text style={s.palette}>{t('mobile.organs.in_palette')}</Text>}
          <Indicators candidate={chosen} />
        </Card>
        <Label>{t('mobile.bioindicator.cover')}</Label>
        <View style={s.chips}>
          {COVERS.map((c) => <Chip key={c.key} role="radio" label={t(`mobile.bioindicator.covers.${c.key}`)} selected={cover === c.key} onPress={() => setCover(c.key)} />)}
        </View>
        <Body muted>{t('mobile.bioindicator.cover_hint', { abundance: t(`soil.abundances.${abundanceForCover(coverPercent(cover))}`) })}</Body>
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
      {noted.length > 0 ? <Survey noted={noted} onDone={close} /> : <Body muted>{t('mobile.bioindicator.intro')}</Body>}
      {!online && photos.length > 0 && <Notice tone="warning">{t('mobile.bioindicator.offline')}</Notice>}

      {!result && <OrganChoice value={organ} onChange={setOrgan} />}
      <OrganPhotos photos={photos} onCycle={cycle} onRemove={remove} keptFirst />
      {photos.length > 0 && <Body muted>{t('mobile.bioindicator.kept')}</Body>}

      {photos.length < MAX && !result && (
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          <Button style={{ flex: 1 }} variant="secondary" label={t('plantnet.section.take')} onPress={async () => { const p = await takePhoto(); if (p) add([p]) }} />
          <Button style={{ flex: 1 }} variant="secondary" label={t('plantnet.section.choose')} onPress={async () => add(await pickPhotos(MAX - photos.length))} />
        </View>
      )}
      {!result && <Button label={t('mobile.bioindicator.ai_button')} disabled={photos.length === 0 || busy} onPress={leaveForAi} />}
      {!result && <Body muted>{t('mobile.bioindicator.ai_hint')}</Body>}
      {!result && (
        <Button variant="secondary" label={busy ? t('plantnet.section.identifying') : t('mobile.bioindicator.plantnet_button')} busy={busy}
          disabled={!online || photos.length === 0} onPress={identify} />
      )}
      {error && <Notice tone="error">{error}</Notice>}

      {result && (
        <>
          <Text style={s.section}>{t('plantnet.results.title')}</Text>
          {result.candidates.length === 0 && <Body muted>{t('plantnet.results.empty')}</Body>}
          {result.candidates.map((candidate) => (
            <Card key={candidate.latinName} style={{ gap: space.xs }}>
              <Text style={s.name}>{nameOf(candidate)}</Text>
              <Text style={s.latin}>{candidate.latinName} · {t('plantnet.results.score', { percent: candidate.percent })}</Text>
              {inPalette(candidate.species?.id, palette) && <Text style={s.palette}>{t('mobile.organs.in_palette')}</Text>}
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

/** The plants noted on this patch so far and what, weighted by their cover, they say of the soil. */
function Survey({ noted, onDone }: { noted: NotedPlant[]; onDone: () => void }) {
  const reading = surveyReading(noted).slice(0, READING_LINES)
  return (
    <Card style={{ gap: space.sm }}>
      <Text style={s.section}>{t('mobile.bioindicator.survey.title', { count: noted.length })}</Text>
      <Body muted>{noted.map((p) => `${p.name} (${t(`mobile.bioindicator.covers.${COVERS.find((c) => c.percent === p.coverPercent)?.key ?? 'to_25'}`)})`).join(' · ')}</Body>
      {reading.length > 0 ? (
        <View style={{ gap: space.xs }}>
          <Text style={s.inList}>{t('mobile.bioindicator.survey.reading')}</Text>
          {reading.map((line) => (
            <Body key={line.key}>
              {t(`soil.indicators.${line.key}.label`)}{line.unverified ? ' ?' : ''} · {t('mobile.bioindicator.survey.share', { share: line.share, plants: line.plants.join(', ') })}
            </Body>
          ))}
        </View>
      ) : <Body muted>{t('mobile.bioindicator.survey.no_reading')}</Body>}
      <Body muted>{t('mobile.bioindicator.survey.next')}</Body>
      <Button variant="secondary" label={t('mobile.bioindicator.survey.done')} onPress={onDone} />
    </Card>
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
  section: { fontSize: 20, fontFamily: fonts.title, color: colors.loam900, marginTop: space.md },
  name: { fontSize: 17, fontFamily: fonts.bold, color: colors.loam900 },
  latin: { fontSize: 14, fontFamily: fonts.body, color: colors.loam600 },
  meta: { fontSize: 14, fontFamily: fonts.body, color: colors.loam600 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  palette: { alignSelf: 'flex-start', fontSize: 14, fontFamily: fonts.bold, color: colors.leaf700, backgroundColor: colors.leaf50, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, overflow: 'hidden' },
  inList: { fontSize: 14, fontFamily: fonts.bold, color: colors.prune700 },
  indicator: { fontSize: 14, fontFamily: fonts.medium, color: colors.loam900, backgroundColor: colors.loam100, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, overflow: 'hidden' },
  unverified: { backgroundColor: colors.white, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.loam500 },
})
