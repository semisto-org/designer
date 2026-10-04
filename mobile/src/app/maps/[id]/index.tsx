// The terrain: the map and its design around the person's blue dot, with
// the field actions at thumb reach. Works offline from the downloaded map.
import { Camera, Map, UserLocation, type CameraRef } from '@maplibre/maplibre-react-native'
import * as Location from 'expo-location'
import { router, useLocalSearchParams } from 'expo-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { featureTitle, kindLabel, speciesName } from '@/lib/elements'
import { anchor, bearing, distance } from '@/lib/geo'
import { formatDate, formatDistance, t } from '@/lib/i18n'
import { styleUrl } from '@/lib/maps'
import { outbox } from '@/lib/outbox'
import { takePhoto } from '@/lib/photos'
import { canEdit, type MapFeature, type Position } from '@/lib/types'
import { FeatureLayers } from '@/map/FeatureLayers'
import { useMapBundle } from '@/state/useMapBundle'
import { useOnline, useOutbox } from '@/state/sync'
import { Body, Button, Notice } from '@/ui/kit'
import { colors, fonts, radius, shadow, space } from '@/ui/theme'

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

  // The blue dot's position, for distances and for placing things.
  useEffect(() => {
    let sub: Location.LocationSubscription | null = null
    Location.requestForegroundPermissionsAsync().then(({ granted }) => {
      if (!granted) return
      Location.watchPositionAsync({ accuracy: Location.LocationAccuracy.High, distanceInterval: 1 }, (fix) => {
        setMe([fix.coords.longitude, fix.coords.latitude])
      }).then((s) => { sub = s })
    })
    return () => sub?.remove()
  }, [])

  const selected = useMemo(() => bundle?.features.find((f) => f.id === selectedId) ?? null, [bundle, selectedId])

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

  const addPhoto = async () => {
    const photo = await takePhoto()
    if (!photo) return
    outbox.add({
      type: 'uploadPhoto', mapId, file: photo.file, takenAt: photo.takenAt,
      lng: photo.position?.[0] ?? null, lat: photo.position?.[1] ?? null, featureId: selected?.id ?? null,
    })
    Alert.alert(t('mobile.photo.saved_title'), t(selected ? 'mobile.photo.saved_feature' : 'mobile.photo.saved'))
  }

  return (
    <View style={s.fill}>
      <Map style={s.fill} mapStyle={styleUrl(mapId)} compass compassPosition={{ top: insets.top + 64, right: 12 }}
        attributionPosition={{ bottom: 8, left: 8 }} logo={false}
        onPress={() => setSelectedId(null)}
        onRegionWillChange={(e) => { if (e.nativeEvent.userInteraction) setFollow(false) }}>
        <Camera
          ref={camera}
          initialViewState={bbox ? { bounds: bbox, padding: { top: 80, bottom: 220, left: 30, right: 30 } } : { center: bundle.map.center ?? [4.95, 50.32], zoom: bundle.map.zoom ?? 17 }}
          trackUserLocation={follow ? 'heading' : undefined}
          onTrackUserLocationChange={(e) => setFollow(!!e.nativeEvent.trackUserLocation)}
        />
        <FeatureLayers bundle={bundle} selectedId={selectedId} onSelect={setSelectedId} />
        <UserLocation accuracy heading />
      </Map>

      {/* Header: back, title, sync state */}
      <View style={[s.header, { paddingTop: insets.top + 8 }]}>
        <RoundButton label="‹" accessibilityLabel={t('mobile.common.back')} onPress={() => router.back()} />
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle} numberOfLines={1}>{bundle.map.name}</Text>
          <Pressable onPress={() => router.push({ pathname: '/maps/[id]/outbox', params: { id: String(mapId) } })}>
            <Text style={[s.headerSub, failed > 0 && { color: colors.clay700 }]}>
              {failed > 0 ? t('mobile.terrain.failed', { count: failed })
                : waiting > 0 ? t(online ? 'mobile.terrain.sending' : 'mobile.terrain.waiting', { count: waiting })
                : online ? t('mobile.terrain.synced') : t('mobile.terrain.offline')}
            </Text>
          </Pressable>
        </View>
        <RoundButton label="◎" accessibilityLabel={t('mobile.terrain.follow')} active={follow} onPress={() => setFollow((v) => !v)} />
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
            <Action label={t('mobile.actions.photo')} icon="📷" onPress={addPhoto} />
            <Action label={t('mobile.actions.plant')} icon="🌱" onPress={() => router.push({ pathname: '/maps/[id]/plant', params: { id: String(mapId) } })} />
            <Action label={t('mobile.actions.record')} icon="📍" onPress={() => router.push({ pathname: '/maps/[id]/record', params: { id: String(mapId) } })} />
            <Action label={t('mobile.actions.identify')} icon="🔍" onPress={() => router.push({ pathname: '/maps/[id]/identify', params: { id: String(mapId), ...(selected?.properties.kind === 'plant' ? { featureId: String(selected.id) } : {}) } })} />
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
  return (
    <Pressable onPress={onOpen} style={s.card} accessibilityRole="button">
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={s.cardTitle} numberOfLines={1}>{featureTitle(feature, planting)}</Text>
        <Text style={s.cardSub} numberOfLines={1}>
          {[
            isPlant ? (feature.properties.planted_on ? t('plant_feature.planted_on', { date: formatDate(feature.properties.planted_on) }) : t('mobile.feature.to_plant'))
              : feature.properties.name ? kindLabel(feature.properties.kind) : null,
            isPlant && feature.properties.name ? speciesName(planting, feature.properties.species_id) : null,
            meters !== null ? t('mobile.terrain.distance', { distance: formatDistance(meters), direction }) : null,
          ].filter(Boolean).join(' · ')}
        </Text>
      </View>
      <Text style={s.cardOpen}>{t('mobile.terrain.open')}</Text>
      <Pressable onPress={onClose} hitSlop={12} accessibilityLabel={t('mobile.common.close')}><Text style={s.cardClose}>×</Text></Pressable>
    </Pressable>
  )
}

const DIRECTIONS = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO']
const compass = (deg: number) => DIRECTIONS[Math.round(deg / 45) % 8]

function Action({ label, icon, onPress }: { label: string; icon: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => [s.action, pressed && { opacity: 0.8 }]}>
      <Text style={{ fontSize: 22 }}>{icon}</Text>
      <Text style={s.actionLabel}>{label}</Text>
    </Pressable>
  )
}

function RoundButton({ label, onPress, active, accessibilityLabel }: { label: string; onPress: () => void; active?: boolean; accessibilityLabel: string }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel}
      style={[s.round, active && { backgroundColor: colors.prune600 }]}>
      <Text style={{ fontSize: 22, color: active ? colors.white : colors.prune700 }}>{label}</Text>
    </Pressable>
  )
}

const s = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.loam50 },
  center: { alignItems: 'center', justifyContent: 'center' },
  header: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.md },
  headerTitle: { fontSize: 17, fontFamily: fonts.bold, color: colors.loam900, textShadowColor: '#fff', textShadowRadius: 6 },
  headerSub: { fontSize: 13, color: colors.loam700, textShadowColor: '#fff', textShadowRadius: 6 },
  round: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', ...shadow },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: space.md, gap: space.sm },
  actions: { flexDirection: 'row', gap: space.sm },
  action: { flex: 1, minHeight: 68, borderRadius: radius.lg, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', gap: 2, ...shadow },
  actionLabel: { fontSize: 13, fontFamily: fonts.bold, color: colors.loam700 },
  card: { flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.white, borderRadius: radius.lg, padding: space.md, ...shadow },
  cardTitle: { fontSize: 16, fontFamily: fonts.bold, color: colors.loam900 },
  cardSub: { fontSize: 13, color: colors.loam500 },
  cardOpen: { fontSize: 14, fontFamily: fonts.bold, color: colors.prune600 },
  cardClose: { fontSize: 24, color: colors.loam500, paddingHorizontal: 4 },
})
