// The terrain: one full-screen map of the place around the person's blue
// dot, and one notebook sheet over it. At rest the sheet says what this
// month asks and what grows around; « Noter ici » opens what one can note;
// a feature tapped on the map or in the list fills it with that feature.
// The map itself works offline from the downloaded copy.
import { Camera, Map, UserLocation, type CameraRef } from '@maplibre/maplibre-react-native'
import * as Location from 'expo-location'
import { router, useLocalSearchParams } from 'expo-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useDisplay } from '@/lib/display'
import { hidesMore, isShown } from '@/lib/display-core'
import { anchor } from '@/lib/geo'
import { t, todayIso } from '@/lib/i18n'
import { styleUrl } from '@/lib/maps'
import { outbox } from '@/lib/outbox'
import { pickFeatureId } from '@/lib/pick'
import { around, whereFrom } from '@/lib/terrain'
import { canEdit, type MapFeature, type Position } from '@/lib/types'
import { FeatureLayers } from '@/map/FeatureLayers'
import { useMapBundle } from '@/state/useMapBundle'
import { useOnline, useOutbox } from '@/state/sync'
import {
  AROUND_RADIUS, FeatureBody, FeatureTop, NoteTop, RestBody, RestTop, whereLabel, type NoteChoice, type QuickAction,
} from '@/terrain/SheetContent'
import { chooseMedia } from '@/ui/chooseMedia'
import { Icon } from '@/ui/Icon'
import { Body, Button, IconButton, Notice } from '@/ui/kit'
import { Sheet, type SheetLevel } from '@/ui/Sheet'
import { toast } from '@/ui/Toast'
import { colors, radius, shadows, space, touch, type } from '@/ui/theme'

export default function Terrain() {
  const mapId = Number(useLocalSearchParams<{ id: string }>().id)
  const { bundle, error } = useMapBundle(mapId)
  const online = useOnline()
  const pending = useOutbox().ops.filter((op) => op.mapId === mapId)
  const insets = useSafeAreaInsets()
  const camera = useRef<CameraRef>(null)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [me, setMe] = useState<Position | null>(null)
  const [located, setLocated] = useState<'yes' | 'pending' | 'denied'>('pending')
  const [follow, setFollow] = useState(false)
  const [noting, setNoting] = useState(false)
  const [level, setLevel] = useState<SheetLevel>(0)
  const shown = useDisplay(mapId)

  // The blue dot's position, for distances and for placing things.
  // Every 2 m is enough for « à 12 m au nord-est », and spares the battery.
  useEffect(() => {
    let sub: Location.LocationSubscription | null = null
    let gone = false
    Location.requestForegroundPermissionsAsync().then(async ({ granted }) => {
      if (gone) return
      if (!granted) { setLocated('denied'); return }
      const watcher = await Location.watchPositionAsync({ accuracy: Location.LocationAccuracy.High, distanceInterval: 2 }, (fix) => {
        setMe([fix.coords.longitude, fix.coords.latitude])
        setLocated('yes')
      })
      // The screen closed while permission was asked: stop at once.
      if (gone) watcher.remove()
      else sub = watcher
    })
    return () => { gone = true; sub?.remove() }
  }, [])

  // What the display shows: the map, the list around and the selection follow it.
  const visible = useMemo(
    () => (bundle ? bundle.features.filter((f) => isShown(f.properties, shown, bundle.planting)) : []),
    [bundle, shown],
  )
  const selected = useMemo(() => visible.find((f) => f.id === selectedId) ?? null, [visible, selectedId])
  const nearby = useMemo(() => (me ? around(visible, me, { radius: AROUND_RADIUS }) : []), [visible, me])

  if (!bundle) {
    return (
      <View style={[s.fill, s.center, { padding: space.xl, gap: space.md }]}>
        <Body>{error === 'not_found' ? t('mobile.terrain.not_found') : !online ? t('mobile.terrain.offline_not_downloaded') : t('mobile.terrain.loading')}</Body>
        <Button variant="secondary" label={t('mobile.common.back')} onPress={() => router.back()} />
      </View>
    )
  }

  const editable = canEdit(bundle.map)
  const failed = pending.filter((op) => op.error).length
  const waiting = pending.length - failed
  const bbox = bundle.map.bbox
  // Online first: a quiet « à jour » most of the time; the outbox speaks only when it holds something.
  const sync = failed > 0
    ? { icon: 'error' as const, color: colors.clay700, label: t('mobile.terrain.failed', { count: failed }) }
    : waiting > 0
      ? { icon: online ? 'sending' as const : 'offline' as const, color: colors.humus700, label: t(online ? 'mobile.terrain.sending' : 'mobile.terrain.waiting', { count: waiting }) }
      : { icon: online ? 'synced' as const : 'offline' as const, color: online ? colors.leaf700 : colors.loam600, label: online ? t('mobile.terrain.synced') : t('mobile.terrain.offline') }

  const go = (pathname: string, params: Record<string, string> = {}) =>
    router.push({ pathname: pathname as never, params: { id: String(mapId), ...params } })

  const pick = (feature: MapFeature) => {
    setNoting(false)
    setSelectedId(feature.id)
    setLevel(1)
    setFollow(false)
    camera.current?.easeTo({ center: anchor(feature.geometry), duration: 400, padding: { top: 120, bottom: 360, left: 0, right: 0 } })
  }
  const unselect = () => { setSelectedId(null); setLevel(0) }

  const addPhoto = async (feature: MapFeature | null) => {
    const choice = await chooseMedia()
    if (!choice) return
    for (const item of choice.items) {
      outbox.add({
        type: 'uploadPhoto', mapId, file: item.file, takenAt: item.takenAt,
        lng: item.position?.[0] ?? null, lat: item.position?.[1] ?? null, featureId: feature?.id ?? null,
      })
    }
    const count = choice.items.length
    const title = count > 1 ? 'mobile.photo.saved_title_many' : choice.items[0].video ? 'mobile.photo.saved_title_video' : 'mobile.photo.saved_title'
    const body = feature ? t(count > 1 ? 'mobile.photo.saved_feature_many' : 'mobile.photo.saved_feature')
      : choice.from === 'library' ? t('mobile.photo.saved_library', { count }) : t('mobile.photo.saved')
    toast(t(title), { body })
  }

  const note = (choice: NoteChoice) => {
    setNoting(false)
    if (choice === 'photo') void addPhoto(null)
    else go(`/maps/[id]/${choice}`)
  }

  // A plant one has just put in the ground: one tap, and « Annuler » for a slip of the thumb.
  const markPlanted = (feature: MapFeature) => {
    const op = outbox.add({
      type: 'updateFeature', mapId, featureId: feature.id, lockVersion: feature.properties.lockVersion,
      changes: { patch: { planted_on: todayIso() } },
    })
    toast(t('mobile.terrain.planted_toast'), {
      action: {
        label: t('mobile.terrain.undo'),
        onPress: () => {
          if (outbox.get().ops.some((o) => o.id === op.id)) outbox.discard(op.id)
          else outbox.add({ type: 'updateFeature', mapId, featureId: feature.id, lockVersion: feature.properties.lockVersion, changes: { patch: { planted_on: null } } })
          toast(t('mobile.terrain.undone'), { tone: 'info' })
        },
      },
    })
  }

  const quickActions = (feature: MapFeature): QuickAction[] => {
    const open = () => go('/maps/[id]/features/[featureId]', { featureId: String(feature.id) })
    if (!editable) return [{ key: 'open', icon: 'sheet', label: t('mobile.terrain.open_full'), onPress: open, primary: true }]
    const isPlant = feature.properties.kind === 'plant'
    const list: QuickAction[] = []
    if (isPlant && !feature.properties.planted_on) list.push({ key: 'planted', icon: 'planted', label: t('mobile.terrain.planted_today'), onPress: () => markPlanted(feature), primary: true })
    if (isPlant && feature.properties.planted_on) list.push({ key: 'follow', icon: 'followUp', label: t('mobile.terrain.follow_up'), onPress: open, primary: true })
    list.push({ key: 'photo', icon: 'photo', label: t('mobile.actions.photo'), onPress: () => void addPhoto(feature) })
    if (isPlant) list.push({ key: 'identify', icon: 'identify', label: t('mobile.actions.identify'), onPress: () => go('/maps/[id]/identify', { featureId: String(feature.id) }) })
    return list
  }

  const photosOf = (feature: MapFeature) =>
    bundle.photos.filter((p) => p.featureId === feature.id).sort((a, b) => (b.takenAt ?? '').localeCompare(a.takenAt ?? ''))
  const where = selected && me ? (() => { const w = whereFrom(me, selected); return whereLabel(w.meters, w.direction) })() : null

  return (
    <View style={s.fill}>
      <Map style={s.fill} mapStyle={styleUrl(mapId)} compass compassPosition={{ top: insets.top + 64, right: 12 }}
        attributionPosition={{ top: insets.top + 64, left: 8 }} logo={false}
        onPress={(e) => { if (!('features' in e.nativeEvent && pickFeatureId(e.nativeEvent.features) !== null)) unselect() }}
        onRegionWillChange={(e) => { if (e.nativeEvent.userInteraction) setFollow(false) }}>
        <Camera
          ref={camera}
          initialViewState={bbox ? { bounds: bbox, padding: { top: 80, bottom: 220, left: 30, right: 30 } } : { center: bundle.map.center ?? [4.95, 50.32], zoom: bundle.map.zoom ?? 17 }}
          trackUserLocation={follow ? 'heading' : undefined}
          onTrackUserLocationChange={(e) => setFollow(!!e.nativeEvent.trackUserLocation)}
        />
        <FeatureLayers bundle={bundle} display={shown} selectedId={selectedId}
          onSelect={(id) => { const feature = id === null ? null : visible.find((f) => f.id === id); if (feature) pick(feature); else unselect() }} />
        <UserLocation accuracy heading />
      </Map>

      {/* Header: back, the map's name on a paper label (readable in the sun) with its sync state */}
      <View style={[s.header, { paddingTop: insets.top + 8 }]}>
        <IconButton icon="back" label={t('mobile.common.back')} onPress={() => router.back()} />
        <Pressable
          style={s.titleChip}
          accessibilityRole="button"
          accessibilityHint={t('mobile.outbox.title')}
          onPress={() => go('/maps/[id]/outbox')}
        >
          <Text style={s.headerTitle} numberOfLines={1} maxFontSizeMultiplier={1.3}>{bundle.map.name}</Text>
          <View style={s.headerLine}>
            <Icon name={sync.icon} size={16} color={sync.color} />
            <Text style={[s.headerSub, { color: sync.color }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>{sync.label}</Text>
          </View>
        </Pressable>
        <IconButton icon="display" label={hidesMore(shown) ? t('mobile.terrain.hides_more') : t('mobile.display.open')} dot={hidesMore(shown)}
          onPress={() => go('/maps/[id]/display')} />
        <IconButton icon="follow" label={t('mobile.terrain.follow')} active={follow} onPress={() => setFollow((v) => !v)} />
      </View>

      <Sheet
        level={level}
        onLevel={setLevel}
        bottomInset={insets.bottom}
        topInset={insets.top + touch.field + 24}
        top={
          <>
            {bundle.map.readOnlyByPlan && <View style={{ paddingHorizontal: space.lg, paddingBottom: space.sm }}><Notice tone="warning">{t('mobile.maps.read_only_by_plan')}</Notice></View>}
            {selected
              ? <FeatureTop mapId={mapId} feature={selected} planting={bundle.planting} photo={photosOf(selected)[0] ?? null} where={where}
                  gestures={quickActions(selected)} onClose={unselect} />
              : noting
                ? <NoteTop onChoose={note} onClose={() => setNoting(false)} />
                : <RestTop editable={editable} onNote={() => { setNoting(true); setLevel(0) }} />}
          </>
        }
      >
        {selected
          ? <FeatureBody mapId={mapId} feature={selected} photos={photosOf(selected)}
              onOpen={() => go('/maps/[id]/features/[featureId]', { featureId: String(selected.id) })} />
          : <RestBody around={nearby} located={located} planting={bundle.planting} onPick={pick} viewer={!editable && !bundle.map.readOnlyByPlan} />}
      </Sheet>
    </View>
  )
}

const s = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.loam50 },
  center: { alignItems: 'center', justifyContent: 'center' },
  header: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.md },
  titleChip: {
    flex: 1, minHeight: touch.field, justifyContent: 'center', paddingHorizontal: space.md, paddingVertical: 6,
    backgroundColor: colors.paper, borderRadius: radius.control, borderWidth: 1, borderColor: colors.loam200, ...shadows.md,
  },
  headerTitle: { ...type.mapName, fontSize: 19, lineHeight: 23, color: colors.loam900 },
  headerLine: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  headerSub: { ...type.meta, flexShrink: 1 },
})
