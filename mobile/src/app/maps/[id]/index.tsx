// The terrain: the map and its design around the person's blue dot, with
// the field actions at thumb reach. Works offline from the downloaded map.
import { Camera, Map, UserLocation, type CameraRef } from '@maplibre/maplibre-react-native'
import * as Location from 'expo-location'
import { router, useLocalSearchParams } from 'expo-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useDisplay } from '@/lib/display'
import { hidesMore, isShown } from '@/lib/display-core'
import { featureTitle, kindLabel, speciesName } from '@/lib/elements'
import { anchor, bearing, distance } from '@/lib/geo'
import { formatDate, formatDay, formatDistance, seasonOf, t } from '@/lib/i18n'
import { haptics } from '@/lib/haptics'
import { styleUrl } from '@/lib/maps'
import { outbox } from '@/lib/outbox'
import { pickFeatureId } from '@/lib/pick'
import { canEdit, type MapFeature, type Position } from '@/lib/types'
import { FeatureLayers } from '@/map/FeatureLayers'
import { useMapBundle } from '@/state/useMapBundle'
import { useOnline, useOutbox } from '@/state/sync'
import { chooseMedia } from '@/ui/chooseMedia'
import { Icon, type IconName } from '@/ui/Icon'
import { Body, Button, IconButton, Notice } from '@/ui/kit'
import { toast } from '@/ui/Toast'
import { colors, fonts, radius, shadows, space, touch, type } from '@/ui/theme'

export default function Terrain() {
  const mapId = Number(useLocalSearchParams<{ id: string }>().id)
  const { bundle, error } = useMapBundle(mapId)
  const online = useOnline()
  const pending = useOutbox().ops.filter((op) => op.mapId === mapId)
  const insets = useSafeAreaInsets()
  const camera = useRef<CameraRef>(null)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [me, setMe] = useState<Position | null>(null)
  const [follow, setFollow] = useState(false)
  const shown = useDisplay(mapId)

  // The blue dot's position, for distances and for placing things.
  // Every 2 m is enough for « à 12 m au NE », and spares the battery.
  useEffect(() => {
    let sub: Location.LocationSubscription | null = null
    let gone = false
    Location.requestForegroundPermissionsAsync().then(async ({ granted }) => {
      if (!granted || gone) return
      const watcher = await Location.watchPositionAsync({ accuracy: Location.LocationAccuracy.High, distanceInterval: 2 }, (fix) => {
        setMe([fix.coords.longitude, fix.coords.latitude])
      })
      // The screen closed while permission was asked: stop at once.
      if (gone) watcher.remove()
      else sub = watcher
    })
    return () => { gone = true; sub?.remove() }
  }, [])

  // A feature the display now hides is no longer selected.
  const selected = useMemo(() => {
    const feature = bundle?.features.find((f) => f.id === selectedId) ?? null
    return feature && isShown(feature.properties, shown, bundle?.planting) ? feature : null
  }, [bundle, selectedId, shown])

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
  const sync = failed > 0
    ? { icon: 'error' as const, color: colors.clay700, issue: true, label: t('mobile.terrain.failed', { count: failed }) }
    : waiting > 0
      ? { icon: online ? 'sending' as const : 'offline' as const, color: colors.humus700, issue: false, label: t(online ? 'mobile.terrain.sending' : 'mobile.terrain.waiting', { count: waiting }) }
      : { icon: online ? 'synced' as const : 'offline' as const, color: online ? colors.leaf700 : colors.loam600, issue: false, label: online ? t('mobile.terrain.synced') : t('mobile.terrain.offline') }

  const addPhoto = async () => {
    const choice = await chooseMedia()
    if (!choice) return
    for (const item of choice.items) {
      outbox.add({
        type: 'uploadPhoto', mapId, file: item.file, takenAt: item.takenAt,
        lng: item.position?.[0] ?? null, lat: item.position?.[1] ?? null, featureId: selected?.id ?? null,
      })
    }
    const count = choice.items.length
    const title = count > 1 ? 'mobile.photo.saved_title_many' : choice.items[0].video ? 'mobile.photo.saved_title_video' : 'mobile.photo.saved_title'
    const body = selected ? t(count > 1 ? 'mobile.photo.saved_feature_many' : 'mobile.photo.saved_feature')
      : choice.from === 'library' ? t('mobile.photo.saved_library', { count }) : t('mobile.photo.saved')
    toast(t(title), { body })
  }

  return (
    <View style={s.fill}>
      <Map style={s.fill} mapStyle={styleUrl(mapId)} compass compassPosition={{ top: insets.top + 64, right: 12 }}
        attributionPosition={{ bottom: 8, left: 8 }} logo={false}
        onPress={(e) => { if (!('features' in e.nativeEvent && pickFeatureId(e.nativeEvent.features) !== null)) setSelectedId(null) }}
        onRegionWillChange={(e) => { if (e.nativeEvent.userInteraction) setFollow(false) }}>
        <Camera
          ref={camera}
          initialViewState={bbox ? { bounds: bbox, padding: { top: 80, bottom: 220, left: 30, right: 30 } } : { center: bundle.map.center ?? [4.95, 50.32], zoom: bundle.map.zoom ?? 17 }}
          trackUserLocation={follow ? 'heading' : undefined}
          onTrackUserLocationChange={(e) => setFollow(!!e.nativeEvent.trackUserLocation)}
        />
        <FeatureLayers bundle={bundle} display={shown} selectedId={selectedId} onSelect={setSelectedId} />
        <UserLocation accuracy heading />
      </Map>

      {/* Header: back, the map's name on a paper label (readable in the sun), the day and sync state */}
      <View style={[s.header, { paddingTop: insets.top + 8 }]}>
        <IconButton icon="back" label={t('mobile.common.back')} onPress={() => router.back()} />
        <Pressable
          style={s.titleChip}
          accessibilityRole="button"
          accessibilityHint={t('mobile.outbox.title')}
          onPress={() => router.push({ pathname: '/maps/[id]/outbox', params: { id: String(mapId) } })}
        >
          <Text style={s.headerTitle} numberOfLines={1} maxFontSizeMultiplier={1.3}>{bundle.map.name}</Text>
          <View style={s.headerLine}>
            <Icon name={sync.icon} size={16} color={sync.color} />
            <Text style={[s.headerSub, { color: sync.color }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>
              {sync.issue ? sync.label : `${t('mobile.terrain.today', { season: t(`mobile.terrain.seasons.${seasonOf()}`), date: formatDay() })} · ${sync.label}`}
            </Text>
          </View>
        </Pressable>
        <IconButton icon="display" label={hidesMore(shown) ? t('mobile.terrain.hides_more') : t('mobile.display.open')} dot={hidesMore(shown)}
          onPress={() => router.push({ pathname: '/maps/[id]/display', params: { id: String(mapId) } })} />
        <IconButton icon="follow" label={t('mobile.terrain.follow')} active={follow} onPress={() => setFollow((v) => !v)} />
      </View>

      {/* Bottom: the selected feature, else the actions */}
      <View style={[s.bottom, { paddingBottom: insets.bottom + 12 }]}>
        {bundle.map.readOnlyByPlan && <Notice tone="warning">{t('mobile.maps.read_only_by_plan')}</Notice>}
        {selected ? (
          <SelectedCard feature={selected} me={me} planting={bundle.planting} onOpen={() =>
            router.push({ pathname: '/maps/[id]/features/[featureId]', params: { id: String(mapId), featureId: String(selected.id) } })}
            onClose={() => setSelectedId(null)} />
        ) : null}
        {editable ? (
          <View style={s.actions}>
            <Action label={t('mobile.actions.photo')} icon="photo" onPress={addPhoto} />
            <Action label={t('mobile.actions.plant')} icon="plant" onPress={() => router.push({ pathname: '/maps/[id]/plant', params: { id: String(mapId) } })} />
            <Action label={t('mobile.actions.record')} icon="point" onPress={() => router.push({ pathname: '/maps/[id]/record', params: { id: String(mapId) } })} />
            <Action label={t('mobile.actions.identify')} icon="identify" onPress={() => router.push({ pathname: '/maps/[id]/identify', params: { id: String(mapId), ...(selected?.properties.kind === 'plant' ? { featureId: String(selected.id) } : {}) } })} />
          </View>
        ) : (
          !selected && <Notice>{t('mobile.terrain.viewer')}</Notice>
        )}
      </View>
    </View>
  )
}

function SelectedCard({ feature, me, planting, onOpen, onClose }: {
  feature: MapFeature; me: Position | null; planting: Parameters<typeof featureTitle>[1]; onOpen: () => void; onClose: () => void
}) {
  const point = anchor(feature.geometry)
  const meters = me ? distance(me, point) : null
  const direction = me ? compass(bearing(me, point)) : null
  const isPlant = feature.properties.kind === 'plant'
  const title = featureTitle(feature, planting)
  const parts = (where: string | null) => [
    isPlant ? (feature.properties.planted_on ? t('plant_feature.planted_on', { date: formatDate(feature.properties.planted_on) }) : t('mobile.feature.to_plant'))
      : feature.properties.name ? kindLabel(feature.properties.kind) : null,
    isPlant && feature.properties.name ? speciesName(planting, feature.properties.species_id) : null,
    meters !== null ? t('mobile.terrain.distance', { distance: formatDistance(meters), direction: where }) : null,
  ].filter(Boolean).join(' · ')
  // Two buttons side by side, never one inside the other (screen readers reach both).
  return (
    <View style={s.card}>
      <Pressable onPress={onOpen} style={s.cardMain} accessibilityRole="button"
        accessibilityLabel={`${title}, ${parts(direction && t(`mobile.terrain.directions.${direction}`))}`} accessibilityHint={t('mobile.terrain.open')}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={s.cardTitle} numberOfLines={1}>{title}</Text>
          <Text style={s.cardSub} numberOfLines={1}>{parts(direction)}</Text>
        </View>
        <Text style={s.cardOpen}>{t('mobile.terrain.open')}</Text>
        <Icon name="next" size={20} color={colors.prune700} />
      </Pressable>
      <Pressable onPress={onClose} style={s.cardClose} accessibilityRole="button" accessibilityLabel={t('mobile.common.close')}>
        <Icon name="close" color={colors.loam600} />
      </Pressable>
    </View>
  )
}

const DIRECTIONS = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO']
const compass = (deg: number) => DIRECTIONS[Math.round(deg / 45) % 8]

function Action({ label, icon, onPress }: { label: string; icon: IconName; onPress: () => void }) {
  return (
    <Pressable onPress={() => { haptics.tap(); onPress() }} accessibilityRole="button" accessibilityLabel={label}
      style={({ pressed }) => [s.action, pressed && { transform: [{ scale: 0.97 }] }]}>
      <Icon name={icon} size={26} color={colors.prune700} />
      <Text style={s.actionLabel} numberOfLines={1} maxFontSizeMultiplier={1.3}>{label}</Text>
    </Pressable>
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
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: space.md, gap: space.sm },
  actions: { flexDirection: 'row', gap: space.sm },
  action: {
    flex: 1, minHeight: 72, borderRadius: radius.lg, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.loam200,
    alignItems: 'center', justifyContent: 'center', gap: 4, ...shadows.md,
  },
  actionLabel: { ...type.label, color: colors.loam800 },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.paper, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.loam200, ...shadows.md },
  cardMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: touch.field, paddingLeft: space.lg, paddingVertical: space.md },
  cardTitle: { fontSize: 16, fontFamily: fonts.bold, color: colors.loam900 },
  cardSub: { ...type.meta, color: colors.loam500 },
  cardOpen: { fontSize: 14, fontFamily: fonts.bold, color: colors.prune600 },
  cardClose: { width: touch.field, minHeight: touch.field, alignItems: 'center', justifyContent: 'center' },
})
