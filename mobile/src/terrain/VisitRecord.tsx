// What the phone records of the walk, under the visit's title: the sound
// (what the owner says, for the report and the offer letter) and the track
// (where the walk went). Each one starts with a tap and pauses with another;
// both end with the visit, the sound filed in the map's documents.
import { useEffect, useState, useSyncExternalStore } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { haptics } from '@/lib/haptics'
import { t } from '@/lib/i18n'
import { visits, type RecordResult } from '@/lib/visit'
import { clock, walked, type Visit } from '@/lib/visit-core'
import { visitAudio } from '@/lib/visitAudio'
import { visitTrack } from '@/lib/visitTrack'
import { Icon, type IconName } from '@/ui/Icon'
import { MAX_FONT_SCALE } from '@/ui/kit'
import { toast } from '@/ui/Toast'
import { colors, fonts, radius, space, touch, type } from '@/ui/theme'

/** The recorder's clock, read every second while it is live (a phone call can pause it). */
function useSound() {
  const flags = useSyncExternalStore(visitAudio.subscribe, () => `${visitAudio.state().live}:${visitAudio.state().recording}`)
  const live = flags.startsWith('true')
  const [, tick] = useState(0)
  useEffect(() => {
    if (!live) return
    const timer = setInterval(() => tick((n) => n + 1), 1000)
    return () => clearInterval(timer)
  }, [live])
  return visitAudio.state()
}

function useWalked(key: string) {
  const [meters, setMeters] = useState(() => visitTrack.meters(key))
  useEffect(() => visitTrack.subscribe(() => setMeters(visitTrack.meters(key))), [key])
  return meters
}

export function VisitRecord({ mapId, visit }: { mapId: number; visit: Visit }) {
  const sound = useSound()
  const meters = useWalked(visit.key)
  const [busy, setBusy] = useState<'sound' | 'walk' | null>(null)

  // A recording whose app was closed meanwhile is kept as it is, and sent at the end.
  const soundLost = !!visit.audio && !sound.live
  const soundState = soundLost ? 'lost' : sound.recording ? 'on' : visit.audio ? 'paused' : 'off'
  const walkState = visit.tracking ? 'on' : meters > 0 ? 'paused' : 'off'

  const said = (result: RecordResult, what: 'sound' | 'walk') => {
    if (result === 'started') return haptics.success()
    toast(t(`mobile.visit.record.${what}`), { body: t(result === 'no_permission' ? `mobile.visit.record.no_permission_${what}` : 'mobile.visit.record.failed'), tone: 'warning' })
  }

  const toggleSound = async () => {
    if (soundState === 'lost') return toast(t('mobile.visit.record.sound'), { body: t('mobile.visit.record.lost'), tone: 'info' })
    if (soundState === 'on') { haptics.tap(); return visits.pauseSound() }
    setBusy('sound')
    said(await visits.recordSound(mapId), 'sound')
    setBusy(null)
  }

  const toggleWalk = async () => {
    if (walkState === 'on') { haptics.tap(); return visits.pauseTrack(mapId) }
    setBusy('walk')
    said(await visits.recordTrack(mapId), 'walk')
    setBusy(null)
  }

  return (
    <View style={s.row}>
      <Toggle icon="sound" on={soundState === 'on'} busy={busy === 'sound'} onPress={toggleSound}
        title={t('mobile.visit.record.sound')}
        status={t(`mobile.visit.record.sound_${soundState}`, { time: clock(sound.seconds) })}
        hint={t('mobile.visit.record.sound_hint')} />
      <Toggle icon="walk" on={walkState === 'on'} busy={busy === 'walk'} onPress={toggleWalk}
        title={t('mobile.visit.record.walk')}
        status={t(`mobile.visit.record.walk_${walkState}`, { distance: walked(meters) })}
        hint={t('mobile.visit.record.walk_hint')} />
    </View>
  )
}

function Toggle({ icon, on, busy, title, status, hint, onPress }: { icon: IconName; on: boolean; busy: boolean; title: string; status: string; hint: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} disabled={busy} accessibilityRole="switch" accessibilityState={{ checked: on, busy }}
      accessibilityLabel={`${title}, ${status}`} accessibilityHint={hint}
      style={({ pressed }) => [s.toggle, on && s.toggleOn, pressed && { transform: [{ scale: 0.97 }] }]}>
      <Icon name={on ? 'pause' : icon} size={22} color={on ? colors.clay700 : colors.prune700} />
      <View style={{ flex: 1 }}>
        <Text style={s.title} numberOfLines={1} maxFontSizeMultiplier={1.3}>{title}</Text>
        <Text style={[s.status, on && { color: colors.clay700 }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>
          {on ? '● ' : ''}{status}
        </Text>
      </View>
    </Pressable>
  )
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.sm, marginTop: space.sm },
  toggle: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: touch.min, paddingHorizontal: space.md, paddingVertical: space.xs,
    borderRadius: radius.lg, backgroundColor: colors.loam50, borderWidth: 1, borderColor: colors.loam200,
  },
  toggleOn: { backgroundColor: colors.clay50, borderColor: colors.clay100 },
  title: { fontSize: 15, fontFamily: fonts.medium, color: colors.loam900 },
  status: { ...type.meta, color: colors.loam600 },
})
