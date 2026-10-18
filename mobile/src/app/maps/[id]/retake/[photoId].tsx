// « Reprendre cette photo »: the camera with the earlier photo laid faintly
// over it, so the new one is taken from the same spot, in the same direction,
// with the same framing. The blue-dot guidance first brings the person to
// where the earlier photo was taken, then turns them to face the same way.
// The new photo joins the series (retake_of) and goes through the outbox,
// so it works without network; the before/after shows at once.
import { CameraView, useCameraPermissions } from 'expo-camera'
import * as Location from 'expo-location'
import { router, useLocalSearchParams } from 'expo-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { haptics } from '@/lib/haptics'
import { formatDate, formatDistance, t } from '@/lib/i18n'
import { outbox } from '@/lib/outbox'
import { normalize } from '@/lib/photos'
import { guide } from '@/lib/retake'
import { arrowAngle } from '@/lib/tour'
import type { Position } from '@/lib/types'
import { useMapBundle } from '@/state/useMapBundle'
import { BeforeAfter } from '@/ui/BeforeAfter'
import { Icon } from '@/ui/Icon'
import { Body, Button, IconButton, MAX_FONT_SCALE, Notice } from '@/ui/kit'
import { RemoteImage } from '@/ui/RemoteImage'
import { toast } from '@/ui/Toast'
import { colors, fonts, radius, space, type } from '@/ui/theme'

/** How strongly the earlier photo shows over the camera, in turn. */
const GHOSTS = [0.45, 0.7, 0] as const

type Shot = { file: string; takenAt: string; position: Position | null; heading: number | null; width: number; height: number }

export default function Retake() {
  const params = useLocalSearchParams<{ id: string; photoId: string }>()
  const mapId = Number(params.id)
  const photoId = Number(params.photoId)
  const { bundle } = useMapBundle(mapId)
  const origin = bundle?.photos.find((p) => p.id === photoId)
  const insets = useSafeAreaInsets()
  const [permission, ask] = useCameraPermissions()
  const camera = useRef<CameraView>(null)
  const [ready, setReady] = useState(false)
  const [ghost, setGhost] = useState(0)
  const [me, setMe] = useState<Position | null>(null)
  const [accuracy, setAccuracy] = useState<number | null>(null)
  const [heading, setHeading] = useState<number | null>(null)
  const [shot, setShot] = useState<Shot | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => { if (permission && !permission.granted && permission.canAskAgain) void ask() }, [permission, ask])

  // Where the person stands and faces, while the camera is open.
  useEffect(() => {
    const subs: Location.LocationSubscription[] = []
    let gone = false
    const keep = (sub: Location.LocationSubscription) => { if (gone) sub.remove(); else subs.push(sub) }
    Location.requestForegroundPermissionsAsync().then(async ({ granted }) => {
      if (!granted || gone) return
      keep(await Location.watchPositionAsync({ accuracy: Location.LocationAccuracy.Highest, distanceInterval: 1 }, (fix) => {
        setMe([fix.coords.longitude, fix.coords.latitude])
        setAccuracy(fix.coords.accuracy ?? null)
      }))
      keep(await Location.watchHeadingAsync((h) => setHeading(h.trueHeading >= 0 ? h.trueHeading : h.magHeading >= 0 ? h.magHeading : null)))
    }).catch(() => {})
    return () => { gone = true; subs.forEach((sub) => sub.remove()) }
  }, [])

  const step = useMemo(() => (origin ? guide(origin, me, accuracy, heading) : null), [origin, me, accuracy, heading])
  const wasReady = useRef(false)
  useEffect(() => {
    const isReady = step?.step === 'ready'
    if (isReady && !wasReady.current) haptics.success()
    wasReady.current = isReady
  }, [step])

  if (!bundle || !origin) {
    return <View style={[s.fill, s.center]}><Body muted>{t('mobile.retake.gone')}</Body></View>
  }
  const ratio = origin.width && origin.height ? origin.width / origin.height : 3 / 4

  const take = async () => {
    if (!camera.current || busy) return
    setBusy(true)
    try {
      const picture = await camera.current.takePictureAsync({ quality: 0.9, exif: false })
      haptics.success()
      setShot({
        file: await normalize(picture), takenAt: new Date().toISOString(), position: me, heading,
        width: picture.width, height: picture.height,
      })
    } catch {
      toast(t('mobile.retake.failed'))
    } finally {
      setBusy(false)
    }
  }

  const keep = () => {
    if (!shot) return
    outbox.add({
      type: 'uploadPhoto', mapId, file: shot.file, takenAt: shot.takenAt,
      lng: shot.position?.[0] ?? origin.lng, lat: shot.position?.[1] ?? origin.lat,
      featureId: origin.featureId, heading: shot.heading, retakeOf: origin.retakeOfId ?? origin.id,
    })
    toast(t('mobile.retake.saved_title'), { body: t('mobile.retake.saved') })
    router.back()
  }

  if (shot) {
    return (
      <ScrollView style={s.paper} contentContainerStyle={[s.review, { paddingTop: insets.top + space.md, paddingBottom: insets.bottom + space.xl }]}>
        <Text accessibilityRole="header" style={s.title} maxFontSizeMultiplier={MAX_FONT_SCALE}>{t('mobile.retake.review_title')}</Text>
        <Body muted>{t('mobile.retake.review_hint')}</Body>
        <BeforeAfter mapId={mapId} before={origin} after={{ local: shot.file, takenAt: shot.takenAt, width: shot.width, height: shot.height }} />
        <Button icon="check" label={t('mobile.retake.keep')} onPress={keep} />
        <Button variant="ghost" icon="undo" label={t('mobile.retake.again')} onPress={() => setShot(null)} />
      </ScrollView>
    )
  }

  return (
    <View style={[s.fill, { paddingTop: insets.top, paddingBottom: insets.bottom + space.md }]}>
      <View style={s.bar}>
        <IconButton icon="close" label={t('mobile.common.close')} onPress={() => router.back()} size={48} />
        <Text style={s.barTitle} numberOfLines={1} maxFontSizeMultiplier={1.3}>{t('mobile.retake.title', { date: formatDate(origin.takenAt) })}</Text>
      </View>

      <View style={[s.frame, { aspectRatio: ratio }]}>
        {permission?.granted
          ? <CameraView ref={camera} style={StyleSheet.absoluteFill} facing="back" onCameraReady={() => setReady(true)} />
          : <View style={[StyleSheet.absoluteFill, s.center]}><Notice tone="warning">{t('mobile.retake.no_camera')}</Notice></View>}
        {GHOSTS[ghost] > 0 && (
          <View style={[StyleSheet.absoluteFill, { opacity: GHOSTS[ghost] }]} pointerEvents="none">
            <RemoteImage path={`/maps/${mapId}/photos/${origin.id}/image?size=large`} style={StyleSheet.absoluteFill} />
          </View>
        )}
      </View>

      {step && <GuideLine step={step} heading={heading} accuracy={accuracy} />}

      <View style={s.controls}>
        <Pressable onPress={() => { haptics.select(); setGhost((g) => (g + 1) % GHOSTS.length) }} style={s.side}
          accessibilityRole="button" accessibilityLabel={t('mobile.retake.ghost')} accessibilityValue={{ text: t(`mobile.retake.ghost_levels.${ghost}`) }}>
          <Icon name={GHOSTS[ghost] > 0 ? 'ghost' : 'ghostOff'} size={26} color={colors.paper} />
          <Text style={s.sideLabel} maxFontSizeMultiplier={1.3}>{t(`mobile.retake.ghost_levels.${ghost}`)}</Text>
        </Pressable>
        <Pressable onPress={() => void take()} disabled={!ready || busy || !permission?.granted}
          accessibilityRole="button" accessibilityLabel={t('mobile.retake.shoot')} accessibilityState={{ disabled: !ready || busy }}
          style={({ pressed }) => [s.shutter, step?.step === 'ready' && s.shutterReady, pressed && { transform: [{ scale: 0.94 }] }, (!ready || busy) && { opacity: 0.5 }]}>
          <Icon name="shutter" size={34} color={colors.prune700} />
        </Pressable>
        <View style={s.side} />
      </View>
    </View>
  )
}

function GuideLine({ step, heading, accuracy }: { step: NonNullable<ReturnType<typeof guide>>; heading: number | null; accuracy: number | null }) {
  const angle = step.step === 'walk' ? arrowAngle(step.bearing, heading) : null
  const text = step.step === 'walk' ? t('mobile.retake.walk', { distance: formatDistance(step.meters), direction: step.direction })
    : step.step === 'turn' ? t(step.degrees < 0 ? 'mobile.retake.turn_left' : 'mobile.retake.turn_right')
      : step.step === 'ready' ? t('mobile.retake.ready', { accuracy: formatDistance(accuracy ?? 5) })
        : step.step === 'locating' ? t('mobile.retake.locating') : t('mobile.retake.free')
  return (
    <View style={[s.guide, step.step === 'ready' && s.guideReady]} accessibilityLiveRegion="polite" accessible accessibilityLabel={text}>
      {step.step === 'walk' && angle !== null && (
        <View style={{ transform: [{ rotate: `${angle}deg` }] }}><Icon name="heading" size={24} color={colors.prune700} /></View>
      )}
      {step.step === 'ready' && <Icon name="arrived" size={24} color={colors.leaf700} />}
      <Text style={s.guideText} maxFontSizeMultiplier={1.4}>{text}</Text>
    </View>
  )
}

const s = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.loam900 },
  paper: { flex: 1, backgroundColor: colors.paper },
  center: { alignItems: 'center', justifyContent: 'center', padding: space.lg },
  bar: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.sm, minHeight: 56 },
  barTitle: { flex: 1, ...type.heading, color: colors.paper },
  frame: { width: '100%', overflow: 'hidden', backgroundColor: colors.loam800 },
  guide: {
    flexDirection: 'row', alignItems: 'center', gap: space.sm, marginHorizontal: space.lg, marginTop: space.md,
    padding: space.md, borderRadius: radius.lg, backgroundColor: colors.paper,
  },
  guideReady: { backgroundColor: colors.leaf50 },
  guideText: { flex: 1, ...type.body, fontFamily: fonts.medium, color: colors.loam900 },
  controls: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.xl },
  side: { width: 88, alignItems: 'center', gap: 2 },
  sideLabel: { ...type.meta, color: colors.paper },
  shutter: {
    width: 80, height: 80, borderRadius: 40, backgroundColor: colors.paper, alignItems: 'center', justifyContent: 'center',
    borderWidth: 4, borderColor: colors.loam300,
  },
  shutterReady: { borderColor: colors.leaf400 },
  review: { padding: space.lg, gap: space.md },
  title: { ...type.title, color: colors.loam900 },
})
