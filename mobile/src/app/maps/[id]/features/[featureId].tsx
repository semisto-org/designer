// One element of the map: what it is, its photos and comments and, for a
// plant, its planting and its journal as a frieze through the years and, for a
// fruit tree, its harvest; for a fruit store, its temperature and humidity.
import { router, Stack, useLocalSearchParams } from 'expo-router'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { HarvestSection } from '@/harvest/HarvestSection'
import { api } from '@/lib/api'
import { featureTitle, kindLabel, layerLabel, varietyName } from '@/lib/elements'
import { isFruitStore } from '@/lib/fruitStore'
import { isHarvestable } from '@/lib/harvests'
import { formatDate, t, todayIso } from '@/lib/i18n'
import { entryReady, journalOf, OBSERVATION_KINDS, type JournalEntry, type JournalHarvest, type ObservationKind } from '@/lib/journal'
import { isVideo } from '@/lib/media'
import { observationTime, seenLabel } from '@/lib/season'
import { outbox } from '@/lib/outbox'
import { inWinter, wintersInGround, type PlantedPrecision } from '@/lib/specimen'
import type { Op } from '@/lib/outbox-core'
import { takePhoto } from '@/lib/photos'
import { canEdit, type Comment, type MapFeature, type Photo, type Planting, type Survival } from '@/lib/types'
import { useOnline, useOutbox } from '@/state/sync'
import { useMapBundle } from '@/state/useMapBundle'
import { StoreSection } from '@/storage/StoreSection'
import { keptFile } from '@/lib/storage'
import { chooseMedia } from '@/ui/chooseMedia'
import { Icon, type IconName } from '@/ui/Icon'
import { Body, Button, Card, Chip, Input, Label, Notice, styles } from '@/ui/kit'
import { RemoteImage } from '@/ui/RemoteImage'
import { StrataPlate } from '@/ui/StrataPlate'
import { toast } from '@/ui/Toast'
import { colors, fonts, radius, space, type } from '@/ui/theme'

type Observation = { id: number; observedOn: string; kind?: string; survival: Survival | null; vigor: number | null; note: string | null; author: string | null; thumbUrl: string | null }

const SURVIVALS: Survival[] = ['established', 'struggling', 'dead']
const VIGORS = [1, 2, 3, 4, 5]

export default function FeatureScreen() {
  const params = useLocalSearchParams<{ id: string; featureId: string }>()
  const mapId = Number(params.id)
  const featureId = Number(params.featureId)
  const { bundle } = useMapBundle(mapId)
  const mapOps = useOutbox().ops.filter((op) => op.mapId === mapId)
  const ops = mapOps.filter((op) => 'featureId' in op && op.featureId === featureId)
  const feature = bundle?.features.find((f) => f.id === featureId)

  if (!bundle || !feature) {
    return <View style={[styles.screen, styles.content]}><Body muted>{t('mobile.feature.gone')}</Body></View>
  }
  const editable = canEdit(bundle.map)
  const isPlant = feature.properties.kind === 'plant'
  const seen = observationTime(feature)
  const photos = bundle.photos.filter((p) => p.featureId === featureId)
  const pendingPhotos = ops.flatMap((op) => (op.type === 'uploadPhoto' ? [keptFile(op.file) ?? op.file] : []))

  const addPhoto = async () => {
    const choice = await chooseMedia()
    for (const item of choice?.items ?? []) {
      outbox.add({ type: 'uploadPhoto', mapId, file: item.file, takenAt: item.takenAt, lng: item.position?.[0] ?? null, lat: item.position?.[1] ?? null, featureId, heading: item.heading ?? null })
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.content, { paddingBottom: 48 }]} keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets>
      <Stack.Screen options={{ title: featureTitle(feature, bundle.planting) }} />
      {isPlant ? (
        <Specimen feature={feature} planting={bundle.planting}>
          {seen ? <Body>{sentence(seenLabel(seen))}</Body> : null}
          {feature.properties.notes ? <Body muted>{feature.properties.notes}</Body> : null}
          {feature.id < 0 && <Notice>{t('mobile.feature.not_sent')}</Notice>}
        </Specimen>
      ) : (
        <Card style={{ gap: space.xs }}>
          <Text style={s.kicker}>{layerLabel(feature.properties.layer)} · {kindLabel(feature.properties.kind)}</Text>
          {seen ? <Body>{sentence(seenLabel(seen))}</Body> : null}
          {feature.properties.notes ? <Body muted>{feature.properties.notes}</Body> : null}
          {feature.id < 0 && <Notice>{t('mobile.feature.not_sent')}</Notice>}
        </Card>
      )}

      {isPlant && <PlantSection mapId={mapId} feature={feature} editable={editable} ops={ops} photos={photos} harvestable={isHarvestable(feature, bundle.planting)} />}

      {isHarvestable(feature, bundle.planting) && <HarvestSection bundle={bundle} feature={feature} editable={editable} ops={ops} allOps={mapOps} />}

      {isFruitStore(feature.properties.kind) && <StoreSection mapId={mapId} feature={feature} editable={editable} ops={ops} />}

      <Text style={s.section}>{t('mobile.feature.photos')}</Text>
      {photos.length + pendingPhotos.length === 0 ? <Body muted>{t('mobile.feature.no_photos')}</Body> : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
          {pendingPhotos.map((file) => isVideo(file)
            ? <VideoMark key={file} style={s.thumb} />
            : <RemoteImage key={file} local={file} style={s.thumb} />)}
          {photos.map((photo) => (
            <Pressable key={photo.id} onPress={() => router.push(`/maps/${mapId}/photo/${photo.id}`)}
              accessibilityRole="button" accessibilityLabel={t('mobile.feature.open_photo', { date: formatDate(photo.takenAt) })}>
              <RemoteImage path={`/maps/${mapId}/photos/${photo.id}/image?size=thumb`} style={s.thumb} />
              {photo.kind === 'video' && <VideoMark overlay />}
            </Pressable>
          ))}
        </ScrollView>
      )}
      {editable && <Button variant="secondary" label={t('mobile.feature.add_photo')} onPress={addPhoto} />}

      <Comments mapId={mapId} featureId={featureId} ops={ops} canComment />
    </ScrollView>
  )
}

/**
 * Head of a plant's sheet, as a page of a naturalist's notebook: its number,
 * its name large in Garamond, its Latin name, its strata in watercolour and
 * how many winters it has spent in the ground.
 */
function Specimen({ feature, planting, children }: { feature: MapFeature; planting: Planting; children: React.ReactNode }) {
  const p = feature.properties
  const species = planting.species[String(p.species_id)]
  const variety = varietyName(feature, planting)
  const name = species ? species.commonName ?? species.latinName : p.name || t('plant_feature.no_species')
  const strata = (p.strata as string | undefined) ?? species?.strata ?? null
  const plantedOn = typeof p.planted_on === 'string' ? p.planted_on : null
  const precision = (p.planted_on_precision === 'year' || p.planted_on_precision === 'unknown' ? p.planted_on_precision : null) as PlantedPrecision
  const today = todayIso()
  const winters = plantedOn ? wintersInGround(plantedOn, precision, today) : null
  const age = !plantedOn ? t('plant_feature.specimen.not_planted')
    : winters == null ? null
      : winters === 0 ? t(inWinter(today) ? 'plant_feature.specimen.first_winter_now' : 'plant_feature.specimen.first_winter_ahead')
        : t('plant_feature.specimen.winters', { count: winters })
  return (
    <Card style={{ gap: space.xs }}>
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <View style={{ flex: 1, gap: 2 }}>
          {p.number != null && <Text style={s.kicker}>{String(p.number)}</Text>}
          <Text style={s.specimenName} accessibilityRole="header">{name}</Text>
          {variety && <Text style={s.specimenVariety}>‘{variety}’</Text>}
          {species && species.latinName !== name && <Text style={s.latin}>{species.latinName}</Text>}
        </View>
        {strata && <StrataPlate strata={strata} />}
      </View>
      {strata && <Text style={s.kicker}>{t(`plants.strata.${strata}`)}</Text>}
      {age && <Text style={[s.age, !plantedOn && { color: colors.loam500 }]}>{age}</Text>}
      {plantedOn && <Body muted>{plantedLabel(plantedOn, precision)}</Body>}
      {children}
    </Card>
  )
}

const plantedLabel = (plantedOn: string, precision: PlantedPrecision) =>
  precision === 'unknown' ? t('plant_feature.planted_unknown')
    : precision === 'year' ? t('plant_feature.planted_in', { year: plantedOn.slice(0, 4) })
      : t('plant_feature.planted_on', { date: formatDate(plantedOn) })

/** How many entries the sheet shows before « Toutes les notes ». */
const RECENT = 3

/**
 * « Observations récentes »: the plant's last three entries, then « Noter
 * une observation » (the form) and « Toutes les notes » (the frieze of its
 * years). A plant not yet in the ground offers to mark it planted today.
 */
function PlantSection({ mapId, feature, editable, ops, photos, harvestable }: { mapId: number; feature: MapFeature; editable: boolean; ops: Op[]; photos: Photo[]; harvestable: boolean }) {
  const plantedOn = feature.properties.planted_on
  const [noting, setNoting] = useState(false)
  const [all, setAll] = useState(false)
  const pending = ops.flatMap((op) => (op.type === 'createObservation' ? [op] : []))
  const { data, offline } = useRemote<{ observations: Observation[] }>(plantedOn && feature.id > 0 ? `/maps/${mapId}/features/${feature.id}/plant_observations` : null, pending.length)
  const markPlanted = () => {
    outbox.add({
      type: 'updateFeature', mapId, featureId: feature.id, lockVersion: feature.properties.lockVersion,
      changes: { patch: { planted_on: todayIso() } },
    })
  }
  if (!plantedOn) {
    return (
      <Card style={{ gap: space.md }}>
        <Body muted>{t('plant_feature.specimen.plant_invite')}</Body>
        {editable && <Button label={t('mobile.feature.planted_today')} icon="planted" onPress={markPlanted} />}
      </Card>
    )
  }
  const recent: RecentEntry[] = [
    ...pending.map((op) => ({ key: op.id, observedOn: op.observedOn, kind: op.kind ?? 'follow_up', survival: op.survival, vigor: op.vigor, note: op.note, local: op.photo, thumb: null, pending: true })),
    ...(data?.observations ?? []).map((o) => ({ key: String(o.id), observedOn: o.observedOn, kind: o.kind ?? 'follow_up', survival: o.survival, vigor: o.vigor, note: o.note, local: null, thumb: o.thumbUrl, pending: false })),
  ]
  return (
    <>
      <Text style={s.section} accessibilityRole="header">{t(all ? 'plant_feature.specimen.all_title' : 'plant_feature.specimen.recent')}</Text>
      {!all && (
        <Card style={{ gap: space.md }}>
          {offline && recent.length === 0 && <Body muted>{t('mobile.feature.history_offline')}</Body>}
          {!offline && data && recent.length === 0 && <Body muted>{t('plant_feature.specimen.nothing_yet')}</Body>}
          {recent.slice(0, RECENT).map((entry) => <RecentRow key={entry.key} entry={entry} />)}
        </Card>
      )}
      {noting
        ? <Card><ObservationForm mapId={mapId} featureId={feature.id} onDone={() => setNoting(false)} /></Card>
        : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            {editable && <Button icon="note" label={t('plant_feature.specimen.note')} onPress={() => setNoting(true)} />}
            {(all || recent.length > RECENT) && (
              <Button variant="secondary" label={all ? t('plant_feature.specimen.fewer') : t('plant_feature.specimen.all', { count: recent.length })}
                onPress={() => setAll(!all)} />
            )}
          </View>
        )}
      {all && <Journal mapId={mapId} feature={feature} photos={photos} harvestable={harvestable} ops={ops} observations={data?.observations ?? null} offline={offline} />}
    </>
  )
}

type RecentEntry = { key: string; observedOn: string; kind: string; survival: Survival | null; vigor: number | null; note: string | null; local: string | null; thumb: string | null; pending: boolean }

/** One dated line: what was seen, the note in the notebook's hand, the photo beside it. */
function RecentRow({ entry }: { entry: RecentEntry }) {
  const what = [
    entry.kind !== 'follow_up' ? t(`plant_observations.kinds.${entry.kind}`) : null,
    entry.survival ? t(`plant_observations.survivals.${entry.survival}`) : null,
    entry.vigor ? `${t('plant_observations.vigor')} ${entry.vigor}/5` : null,
  ].filter(Boolean).join(' · ')
  return (
    <View style={s.entry2} accessible accessibilityLabel={[formatDate(entry.observedOn), what, entry.note].filter(Boolean).join(', ')}>
      {entry.thumb || entry.local
        ? <RemoteImage path={entry.thumb} local={entry.local} style={s.smallThumb} />
        : <View style={[s.smallThumb, s.noThumb]}><Icon name="note" size={22} color={colors.loam400} /></View>}
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={s.rowTitle}>{formatDate(entry.observedOn)}{entry.pending ? ` · ${t('mobile.feature.pending')}` : ''}</Text>
        {what ? <Text style={s.rowMeta}>{what}</Text> : null}
        {entry.note ? <Text style={s.entryNote} numberOfLines={3}>{entry.note}</Text> : null}
      </View>
    </View>
  )
}

// One tap says what is noted (reprise, floraison, taille, dégât…), then only
// what that kind asks: the take for a follow-up, words for « Autre ».
function ObservationForm({ mapId, featureId, onDone }: { mapId: number; featureId: number; onDone: () => void }) {
  const [kind, setKind] = useState<ObservationKind>('follow_up')
  const [survival, setSurvival] = useState<Survival | null>(null)
  const [vigor, setVigor] = useState<number | null>(null)
  const [note, setNote] = useState('')
  const [photo, setPhoto] = useState<string | null>(null)
  const ready = entryReady(kind, survival, note)

  const save = () => {
    if (!ready) return
    outbox.add({
      type: 'createObservation', mapId, featureId, observedOn: todayIso(), kind,
      survival: kind === 'follow_up' ? survival : null, vigor: kind === 'follow_up' ? vigor : null, note: note.trim() || null, photo,
    })
    setSurvival(null); setVigor(null); setNote(''); setPhoto(null); setKind('follow_up')
    toast(t('plant_observations.saved'))
    onDone()
  }

  return (
    <View>
      <Label>{t('plant_observations.kind')}</Label>
      <View style={s.chips}>
        {OBSERVATION_KINDS.map((value) => <Chip key={value} role="radio" label={t(`plant_observations.kinds.${value}`)} selected={kind === value} onPress={() => setKind(value)} />)}
      </View>
      <Body muted>{t(`plant_observations.kind_hints.${kind}`)}</Body>
      {kind === 'follow_up' && (
        <>
          <Label>{t('plant_observations.survival')}</Label>
          <View style={s.chips}>
            {SURVIVALS.map((value) => <Chip key={value} label={t(`plant_observations.survivals.${value}`)} selected={survival === value} onPress={() => setSurvival(value)} />)}
          </View>
          <Label>{t('plant_observations.vigor')}</Label>
          <View style={s.chips}>
            {VIGORS.map((value) => <Chip key={value} label={`${value} · ${t(`plant_observations.vigors.${value}`)}`} selected={vigor === value} onPress={() => setVigor(vigor === value ? null : value)} />)}
          </View>
        </>
      )}
      <Label>{t('plant_observations.note')}</Label>
      <Input value={note} onChangeText={setNote} placeholder={t('plant_observations.note_placeholder')} multiline />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, marginTop: space.md }}>
        {photo && <Image source={{ uri: photo }} style={s.smallThumb} />}
        <Button variant="secondary" style={{ flex: 1 }} label={photo ? t('mobile.feature.retake_photo') : t('plant_observations.choose_photo')}
          onPress={async () => { const taken = await takePhoto(); if (taken) setPhoto(taken.file) }} />
      </View>
      <Button style={{ marginTop: space.md }} label={t('plant_observations.save')} disabled={!ready} onPress={save} />
      <Button variant="ghost" label={t('mobile.common.cancel')} onPress={onDone} />
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

const ENTRY_ICONS: Record<ObservationKind, IconName> = {
  follow_up: 'followUp', flowering: 'flowering', pruning: 'pruning', damage: 'damage', disease: 'disease', intervention: 'intervention', other: 'note',
}

/**
 * The plant's life as a frieze: one band per year (« 2026 · année 2 »), and
 * in it, newest first, what was noted, harvested and photographed, down to
 * the day it went in. What waits in the outbox shows at once.
 */
function Journal({ mapId, feature, photos, harvestable, ops, observations, offline }: {
  mapId: number; feature: MapFeature; photos: Photo[]; harvestable: boolean; ops: Op[]; observations: Observation[] | null; offline: boolean
}) {
  const pending = ops.flatMap((op) => (op.type === 'createObservation' ? [op] : []))
  const pendingHarvests = ops.filter((op) => op.type === 'createHarvest').length
  const remote = feature.id > 0
  const data = observations ? { observations } : null
  const { data: harvests } = useRemote<{ harvests: JournalHarvest[] }>(remote && harvestable ? `/maps/${mapId}/features/${feature.id}/plant_harvests` : null, pendingHarvests)
  const years = useMemo(() => journalOf({
    plantedOn: feature.properties.planted_on,
    precision: (feature.properties.planted_on_precision as 'day' | 'year' | 'unknown' | undefined) ?? 'day',
    observations: [
      ...pending.map((op) => ({ key: op.id, observedOn: op.observedOn, kind: op.kind ?? 'follow_up', survival: op.survival, vigor: op.vigor, note: op.note, local: op.photo, pending: true })),
      ...(data?.observations ?? []).map((o) => ({ key: String(o.id), observedOn: o.observedOn, kind: (o.kind ?? 'follow_up') as ObservationKind, survival: o.survival, vigor: o.vigor, note: o.note, author: o.author, thumb: o.thumbUrl })),
    ],
    harvests: (harvests?.harvests ?? []).map((h) => ({ ...h, key: String((h as JournalHarvest & { id?: number }).id ?? h.notedOn) })),
    photos: photos.map((p) => ({ id: p.id, takenAt: p.takenAt })),
  }), [feature, pending, data, harvests, photos])

  return (
    <View style={{ gap: space.md }}>
      {offline && <Body muted>{t('mobile.feature.history_offline')}</Body>}
      {!offline && data && years.length === 0 && <Body muted>{t('plant_observations.empty')}</Body>}
      {years.map((year) => (
        <View key={year.year} style={s.year}>
          <Text style={s.yearTitle} accessibilityRole="header">
            {year.age ? t('mobile.journal.year_age', { year: String(year.year), count: year.age }) : String(year.year)}
          </Text>
          <View style={s.band}>
            {year.entries.map((entry) => <JournalRow key={entry.key} mapId={mapId} entry={entry} />)}
          </View>
        </View>
      ))}
    </View>
  )
}

function JournalRow({ mapId, entry }: { mapId: number; entry: JournalEntry }) {
  const when = entry.type === 'planted' && entry.precision === 'year' ? '' : formatDate(entry.date)
  if (entry.type === 'photos') {
    return (
      <View style={s.entry}>
        <View style={s.mark}><Icon name="photo" size={18} color={colors.prune700} /></View>
        <View style={{ flex: 1, gap: space.xs }}>
          <Text style={s.rowMeta}>{[when, t('mobile.journal.photos', { count: entry.ids.length })].join(' · ')}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
            {entry.ids.map((id) => (
              <Pressable key={id} onPress={() => router.push(`/maps/${mapId}/photo/${id}`)} accessibilityRole="button" accessibilityLabel={t('mobile.feature.open_photo', { date: when })}>
                <RemoteImage path={`/maps/${mapId}/photos/${id}/image?size=thumb`} style={s.smallThumb} />
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </View>
    )
  }
  const { icon, title, detail, note, thumb, local, author, pending } =
    entry.type === 'planted' ? { icon: 'planted' as IconName, title: t('mobile.journal.planted'), detail: null, note: null, thumb: null, local: null, author: null, pending: false }
    : entry.type === 'harvest' ? {
        icon: 'harvest' as IconName,
        title: entry.first ? t('mobile.journal.first_harvest') : t(`plant_harvests.stages.${entry.harvest.stage}`),
        detail: entry.harvest.amount ? t(`plant_harvests.amounts.${entry.harvest.stage}.${entry.harvest.amount}`) : null, note: entry.harvest.note, thumb: null, local: null, author: null, pending: false,
      }
    : {
        icon: ENTRY_ICONS[entry.observation.kind] ?? 'note',
        title: t(`plant_observations.kinds.${entry.observation.kind}`),
        detail: [
          entry.observation.survival ? t(`plant_observations.survivals.${entry.observation.survival}`) : null,
          entry.observation.vigor ? `${t('plant_observations.vigor')} ${entry.observation.vigor}/5` : null,
        ].filter(Boolean).join(' · ') || null,
        note: entry.observation.note, thumb: entry.observation.thumb, local: entry.observation.local, author: entry.observation.author, pending: entry.observation.pending,
      }
  const highlight = entry.type === 'planted' || (entry.type === 'harvest' && entry.first)
  return (
    <View style={s.entry} accessible accessibilityLabel={[title, detail, when, note].filter(Boolean).join(', ')}>
      <View style={[s.mark, highlight && s.markStrong]}><Icon name={icon} size={18} color={highlight ? colors.white : colors.prune700} /></View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={s.rowTitle}>{[title, detail].filter(Boolean).join(' · ')}</Text>
        <Text style={s.rowMeta}>{[when, author ? t('plant_observations.by', { name: author }) : null, pending ? t('mobile.feature.pending') : null].filter(Boolean).join(' · ')}</Text>
        {note ? <Text style={s.entryNote}>{note}</Text> : null}
      </View>
      {(thumb || local) && <RemoteImage path={thumb} local={local} style={s.smallThumb} />}
    </View>
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

/** A video among the photos: a play mark, over its still frame (overlay) or on its own while it waits to be sent. */
function VideoMark({ overlay, style }: { overlay?: boolean; style?: object }) {
  return (
    <View style={[overlay ? s.videoOverlay : [s.videoPending, style]]} pointerEvents="none" accessibilityLabel={t('mobile.media.video_label')}>
      <Text style={s.videoPlay}>▶</Text>
    </View>
  )
}

const s = StyleSheet.create({
  kicker: { fontSize: 14, fontFamily: fonts.medium, color: colors.loam600 },
  section: { fontSize: 20, fontFamily: fonts.title, color: colors.loam900, marginTop: space.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  thumb: { width: 120, height: 120, borderRadius: radius.md },
  videoOverlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center' },
  videoPending: { backgroundColor: colors.loam700, alignItems: 'center', justifyContent: 'center' },
  videoPlay: { color: '#fff', fontSize: 28, textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 6 },
  smallThumb: { width: 64, height: 64, borderRadius: radius.md },
  rowTitle: { fontSize: 15, fontFamily: fonts.bold, color: colors.loam900 },
  rowMeta: { fontSize: 14, fontFamily: fonts.body, color: colors.loam600 },
  year: { gap: space.sm },
  yearTitle: { ...type.hand, color: colors.prune700 },
  // The frieze: a thin line down the year, a mark per entry on it.
  band: { borderLeftWidth: 2, borderLeftColor: colors.loam200, marginLeft: 15, paddingLeft: space.md, gap: space.md },
  entry: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md, marginLeft: -(space.md + 17) },
  mark: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.paper, borderWidth: 1.5, borderColor: colors.prune700 },
  markStrong: { backgroundColor: colors.leaf700, borderColor: colors.leaf700 },
  entryNote: { ...type.hand, fontSize: 19, lineHeight: 24, color: colors.loam800 },
  specimenName: { ...type.display, color: colors.loam900 },
  specimenVariety: { fontFamily: fonts.title, fontSize: 24, lineHeight: 28, color: colors.loam700 },
  latin: { fontFamily: fonts.body, fontStyle: 'italic', fontSize: 15, color: colors.loam500 },
  age: { ...type.hand, fontSize: 24, lineHeight: 28, color: colors.leaf700, transform: [{ rotate: '-1deg' }] },
  entry2: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  noThumb: { backgroundColor: colors.loam50, borderWidth: 1, borderColor: colors.loam200, alignItems: 'center', justifyContent: 'center' },
})

/** « Vu hier… »: the sheet's line starts a sentence. */
const sentence = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)
