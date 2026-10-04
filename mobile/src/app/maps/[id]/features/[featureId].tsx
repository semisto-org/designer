// One element of the map: what it is, its photos and comments and, for a
// plant, its planting and follow-up (reprise, vigueur, photo).
import { Stack, useLocalSearchParams } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import { Alert, Image, ScrollView, StyleSheet, Text, View } from 'react-native'
import { api } from '@/lib/api'
import { featureTitle, kindLabel, layerLabel, speciesName } from '@/lib/elements'
import { formatDate, t, todayIso } from '@/lib/i18n'
import { outbox } from '@/lib/outbox'
import { ownProperties, type Op } from '@/lib/outbox-core'
import { takePhoto } from '@/lib/photos'
import { canEdit, type Comment, type MapFeature, type Survival } from '@/lib/types'
import { useOnline, useOutbox } from '@/state/sync'
import { useMapBundle } from '@/state/useMapBundle'
import { Body, Button, Card, Chip, Input, Label, Notice, styles } from '@/ui/kit'
import { RemoteImage } from '@/ui/RemoteImage'
import { colors, fonts, radius, space } from '@/ui/theme'

type Observation = { id: number; observedOn: string; survival: Survival; vigor: number | null; note: string | null; author: string | null; thumbUrl: string | null }

const SURVIVALS: Survival[] = ['established', 'struggling', 'dead']
const VIGORS = [1, 2, 3, 4, 5]

export default function FeatureScreen() {
  const params = useLocalSearchParams<{ id: string; featureId: string }>()
  const mapId = Number(params.id)
  const featureId = Number(params.featureId)
  const { bundle } = useMapBundle(mapId)
  const ops = useOutbox().ops.filter((op) => op.mapId === mapId && 'featureId' in op && op.featureId === featureId)
  const feature = bundle?.features.find((f) => f.id === featureId)

  if (!bundle || !feature) {
    return <View style={[styles.screen, styles.content]}><Body muted>{t('mobile.feature.gone')}</Body></View>
  }
  const editable = canEdit(bundle.map)
  const isPlant = feature.properties.kind === 'plant'
  const photos = bundle.photos.filter((p) => p.featureId === featureId)
  const pendingPhotos = ops.flatMap((op) => (op.type === 'uploadPhoto' ? [op.file] : []))

  const addPhoto = async () => {
    const photo = await takePhoto()
    if (!photo) return
    outbox.add({ type: 'uploadPhoto', mapId, file: photo.file, takenAt: photo.takenAt, lng: photo.position?.[0] ?? null, lat: photo.position?.[1] ?? null, featureId })
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.content, { paddingBottom: 48 }]} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: featureTitle(feature, bundle.planting) }} />
      <Card style={{ gap: space.xs }}>
        <Text style={s.kicker}>{layerLabel(feature.properties.layer)} · {kindLabel(feature.properties.kind)}</Text>
        {isPlant && <Body>{speciesName(bundle.planting, feature.properties.species_id) ?? t('plant_feature.no_species')}</Body>}
        {feature.properties.notes ? <Body muted>{feature.properties.notes}</Body> : null}
        {feature.id < 0 && <Notice>{t('mobile.feature.not_sent')}</Notice>}
      </Card>

      {isPlant && <PlantSection mapId={mapId} feature={feature} editable={editable} ops={ops} />}

      <Text style={s.section}>{t('mobile.feature.photos')}</Text>
      {photos.length + pendingPhotos.length === 0 ? <Body muted>{t('mobile.feature.no_photos')}</Body> : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
          {pendingPhotos.map((file) => <RemoteImage key={file} local={file} style={s.thumb} />)}
          {photos.map((photo) => <RemoteImage key={photo.id} path={`/maps/${mapId}/photos/${photo.id}/image?size=thumb`} style={s.thumb} />)}
        </ScrollView>
      )}
      {editable && <Button variant="secondary" label={t('mobile.feature.add_photo')} onPress={addPhoto} />}

      <Comments mapId={mapId} featureId={featureId} ops={ops} canComment />
    </ScrollView>
  )
}

function PlantSection({ mapId, feature, editable, ops }: { mapId: number; feature: MapFeature; editable: boolean; ops: Op[] }) {
  const plantedOn = feature.properties.planted_on
  const markPlanted = () => {
    outbox.add({
      type: 'updateFeature', mapId, featureId: feature.id, lockVersion: feature.properties.lockVersion,
      changes: { properties: { ...ownProperties(feature.properties), planted_on: todayIso() } },
    })
  }
  return (
    <>
      <Text style={s.section}>{t('plant_observations.title')}</Text>
      <Card style={{ gap: space.md }}>
        {plantedOn
          ? <Body>{t('plant_feature.planted_on', { date: formatDate(plantedOn) })}</Body>
          : <>
              <Body muted>{t('plant_observations.plant_first')}</Body>
              {editable && <Button label={t('mobile.feature.planted_today')} onPress={markPlanted} />}
            </>}
        {plantedOn && editable && <ObservationForm mapId={mapId} featureId={feature.id} />}
      </Card>
      {plantedOn && <Observations mapId={mapId} featureId={feature.id} ops={ops} />}
    </>
  )
}

function ObservationForm({ mapId, featureId }: { mapId: number; featureId: number }) {
  const [survival, setSurvival] = useState<Survival | null>(null)
  const [vigor, setVigor] = useState<number | null>(null)
  const [note, setNote] = useState('')
  const [photo, setPhoto] = useState<string | null>(null)

  const save = () => {
    if (!survival) return
    outbox.add({ type: 'createObservation', mapId, featureId, observedOn: todayIso(), survival, vigor, note: note.trim() || null, photo })
    setSurvival(null); setVigor(null); setNote(''); setPhoto(null)
    Alert.alert(t('plant_observations.saved'))
  }

  return (
    <View>
      <Label>{t('plant_observations.survival')}</Label>
      <View style={s.chips}>
        {SURVIVALS.map((value) => <Chip key={value} label={t(`plant_observations.survivals.${value}`)} selected={survival === value} onPress={() => setSurvival(value)} />)}
      </View>
      <Label>{t('plant_observations.vigor')}</Label>
      <View style={s.chips}>
        {VIGORS.map((value) => <Chip key={value} label={`${value} · ${t(`plant_observations.vigors.${value}`)}`} selected={vigor === value} onPress={() => setVigor(vigor === value ? null : value)} />)}
      </View>
      <Label>{t('plant_observations.note')}</Label>
      <Input value={note} onChangeText={setNote} placeholder={t('plant_observations.note_placeholder')} multiline />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, marginTop: space.md }}>
        {photo && <Image source={{ uri: photo }} style={s.smallThumb} />}
        <Button variant="secondary" style={{ flex: 1 }} label={photo ? t('mobile.feature.retake_photo') : t('plant_observations.choose_photo')}
          onPress={async () => { const taken = await takePhoto(); if (taken) setPhoto(taken.file) }} />
      </View>
      <Button style={{ marginTop: space.md }} label={t('plant_observations.save')} disabled={!survival} onPress={save} />
    </View>
  )
}

/** Data read from the server when online; null while unknown. */
function useRemote<T>(path: string | null, refreshKey: unknown): { data: T | null; offline: boolean } {
  const online = useOnline()
  const [data, setData] = useState<T | null>(null)
  const load = useCallback(async () => {
    if (!path || !online) return
    try { setData(await api<T>('GET', path)) } catch { /* keep what we had */ }
  }, [path, online])
  useEffect(() => { void load() }, [load, refreshKey])
  return { data, offline: !online && data === null }
}

function Observations({ mapId, featureId, ops }: { mapId: number; featureId: number; ops: Op[] }) {
  const pending = ops.flatMap((op) => (op.type === 'createObservation' ? [op] : []))
  const { data, offline } = useRemote<{ observations: Observation[] }>(featureId > 0 ? `/maps/${mapId}/features/${featureId}/plant_observations` : null, pending.length)
  const list = data?.observations ?? []
  return (
    <View style={{ gap: space.sm }}>
      {pending.map((op) => (
        <ObservationRow key={op.id} observedOn={op.observedOn} survival={op.survival} vigor={op.vigor} note={op.note} local={op.photo} pending />
      ))}
      {list.map((o) => <ObservationRow key={o.id} observedOn={o.observedOn} survival={o.survival} vigor={o.vigor} note={o.note} author={o.author} thumb={o.thumbUrl} />)}
      {offline && <Body muted>{t('mobile.feature.history_offline')}</Body>}
      {!offline && data && list.length === 0 && pending.length === 0 && <Body muted>{t('plant_observations.empty')}</Body>}
    </View>
  )
}

function ObservationRow({ observedOn, survival, vigor, note, author, thumb, local, pending }: {
  observedOn: string; survival: Survival; vigor: number | null; note: string | null; author?: string | null; thumb?: string | null; local?: string | null; pending?: boolean
}) {
  return (
    <Card style={{ flexDirection: 'row', gap: space.md, padding: space.md }}>
      {(thumb || local) && <RemoteImage path={thumb} local={local} style={s.smallThumb} />}
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={s.rowTitle}>
          {t(`plant_observations.survivals.${survival}`)}{vigor ? ` · ${t('plant_observations.vigor')} ${vigor}/5` : ''}
        </Text>
        <Text style={s.rowMeta}>
          {[formatDate(observedOn), author ? t('plant_observations.by', { name: author }) : null, pending ? t('mobile.feature.pending') : null].filter(Boolean).join(' · ')}
        </Text>
        {note ? <Body>{note}</Body> : null}
      </View>
    </Card>
  )
}

function Comments({ mapId, featureId, ops, canComment }: { mapId: number; featureId: number; ops: Op[]; canComment: boolean }) {
  const pending = ops.flatMap((op) => (op.type === 'createComment' ? [op] : []))
  const { data, offline } = useRemote<{ comments: Comment[] }>(
    featureId > 0 ? `/maps/${mapId}/comments?commentable_type=MapFeature&commentable_id=${featureId}` : null, pending.length)
  const [body, setBody] = useState('')
  const comments = data?.comments ?? []

  const send = () => {
    if (!body.trim()) return
    outbox.add({ type: 'createComment', mapId, featureId, body: body.trim() })
    setBody('')
  }

  return (
    <>
      <Text style={s.section}>{t('mobile.feature.comments')}</Text>
      {comments.map((c) => (
        <Card key={c.id} style={{ padding: space.md, gap: 2 }}>
          <Text style={s.rowMeta}>{c.author.name} · {formatDate(c.createdAt)}</Text>
          <Body>{c.body}</Body>
        </Card>
      ))}
      {pending.map((op) => (
        <Card key={op.id} style={{ padding: space.md, gap: 2 }}>
          <Text style={s.rowMeta}>{t('mobile.feature.pending')}</Text>
          <Body>{op.body}</Body>
        </Card>
      ))}
      {offline && <Body muted>{t('mobile.feature.history_offline')}</Body>}
      {!offline && data && comments.length === 0 && pending.length === 0 && <Body muted>{t('mobile.feature.no_comments')}</Body>}
      {canComment && (
        <View style={{ gap: space.sm }}>
          <Input value={body} onChangeText={setBody} placeholder={t('mobile.feature.comment_placeholder')} multiline />
          <Button variant="secondary" label={t('mobile.feature.send_comment')} disabled={!body.trim()} onPress={send} />
        </View>
      )}
    </>
  )
}

const s = StyleSheet.create({
  kicker: { fontSize: 13, fontFamily: fonts.medium, color: colors.loam600 },
  section: { fontSize: 20, fontFamily: fonts.title, color: colors.loam900, marginTop: space.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  thumb: { width: 120, height: 120, borderRadius: radius.md },
  smallThumb: { width: 64, height: 64, borderRadius: radius.md },
  rowTitle: { fontSize: 15, fontFamily: fonts.bold, color: colors.loam900 },
  rowMeta: { fontSize: 13, fontFamily: fonts.body, color: colors.loam600 },
})

