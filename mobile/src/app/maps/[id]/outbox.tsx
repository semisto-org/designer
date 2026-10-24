// What is waiting to be sent for this map, and what the server refused
// (with the reason), which the person can send again or drop. After a
// round of sending, it says how it went, and on which change and why it
// stopped: a send that never ends is never silent. While a round goes
// out (from the button or by itself), a bar says « 2 sur 5 » and the
// change being sent shows it on its card.
import { useLocalSearchParams } from 'expo-router'
import { useEffect, useState } from 'react'
import { ActivityIndicator, Alert, FlatList, StyleSheet, Text, View } from 'react-native'
import { formatDate, formatTime, t } from '@/lib/i18n'
import { outbox, type SendProgress, type SendRun } from '@/lib/outbox'
import type { Op } from '@/lib/outbox-core'
import { useOnline, useOutbox, useSendProgress } from '@/state/sync'
import { Body, Button, Card, Notice, styles } from '@/ui/kit'
import { colors, fonts, radius, space } from '@/ui/theme'

export default function OutboxScreen() {
  const mapId = Number(useLocalSearchParams<{ id: string }>().id)
  const ops = useOutbox().ops.filter((op) => op.mapId === mapId)
  const online = useOnline()
  const progress = useSendProgress()
  const [tapped, setTapped] = useState(false)
  // A round started by the app itself shows the same way as one started here.
  const sending = tapped || progress !== null
  const [run, setRun] = useState<SendRun | null>(outbox.lastRun())
  useEffect(() => outbox.subscribe(() => setRun(outbox.lastRun())), [])
  const blocked = run && run.stopped !== 'done' ? run.blocked : undefined

  const sendNow = async () => {
    setTapped(true)
    try { setRun(await outbox.flush()) } finally { setTapped(false) }
  }

  const discard = (op: Op) => Alert.alert(t('mobile.outbox.discard_title'), t('mobile.outbox.discard_body'), [
    { text: t('mobile.common.cancel'), style: 'cancel' },
    { text: t('mobile.outbox.discard'), style: 'destructive', onPress: () => outbox.discard(op.id) },
  ])

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={styles.content}
      data={ops}
      keyExtractor={(op) => op.id}
      ListHeaderComponent={
        <View style={{ gap: space.md }}>
          <Notice tone={online ? 'info' : 'warning'}>{online ? t('mobile.outbox.online') : t('mobile.outbox.offline')}</Notice>
          {progress && <ProgressCard progress={progress} />}
          {online && !sending && ops.some((op) => !op.error) && <Button variant="secondary" label={t('mobile.outbox.send_now')} onPress={sendNow} />}
          {!sending && run && <RunNotice run={run} />}
        </View>
      }
      ListEmptyComponent={<Body muted>{t('mobile.outbox.empty')}</Body>}
      renderItem={({ item: op }) => (
        <Card style={{ gap: space.xs, padding: space.md }}>
          <Text style={s.title}>{t(`mobile.outbox.ops.${op.type}`)}</Text>
          <Text style={s.meta}>{formatDate(op.createdAt)}</Text>
          {op.error
            ? <>
                <Notice tone="error">{op.error === 'parent_failed' || op.error === 'file_missing' ? t(`mobile.outbox.${op.error}`) : t('mobile.outbox.refused', { reason: op.error })}</Notice>
                <View style={{ flexDirection: 'row', gap: space.sm }}>
                  <Button variant="secondary" style={{ flex: 1 }} label={t('mobile.outbox.retry')} disabled={!online} onPress={() => outbox.retry(op.id)} />
                  <Button variant="danger" style={{ flex: 1 }} label={t('mobile.outbox.discard')} onPress={() => discard(op)} />
                </View>
              </>
            : progress?.current?.id === op.id
              ? <View style={s.row}><ActivityIndicator color={colors.prune600} /><Text style={s.sendingNow}>{t('mobile.outbox.sending_this')}</Text></View>
            : blocked?.id === op.id
              ? <>
                  <Notice tone="warning">{t('mobile.outbox.blocked_here', { reason: blocked.reason })}</Notice>
                  <Button variant="danger" label={t('mobile.outbox.discard')} onPress={() => discard(op)} />
                </>
              : <Text style={s.meta}>{t('mobile.outbox.waiting')}</Text>}
        </Card>
      )}
    />
  )
}

/** « Envoi 2 sur 5 », a bar, and what is going out now. */
function ProgressCard({ progress }: { progress: SendProgress }) {
  const step = Math.min(progress.done + 1, progress.total)
  const label = t('mobile.outbox.progress', { done: String(step), total: String(progress.total) })
  return (
    <Card style={{ gap: space.sm, padding: space.md }}>
      <View style={s.row} accessible accessibilityLiveRegion="polite" accessibilityLabel={label}>
        <ActivityIndicator color={colors.prune600} />
        <Text style={s.title}>{label}</Text>
      </View>
      <View style={s.track} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: progress.total, now: progress.done }}>
        <View style={[s.bar, { width: `${Math.round((progress.done / Math.max(progress.total, 1)) * 100)}%` }]} />
      </View>
      {progress.current && <Text style={s.meta}>{t('mobile.outbox.progress_current', { what: t(`mobile.outbox.ops.${progress.current.type}`) })}</Text>}
    </Card>
  )
}

/** How the last round went, in words, with its time: a tap always gets an answer. */
function RunNotice({ run }: { run: SendRun }) {
  if (run.stopped === 'done') return <Notice tone="info">{run.sent > 0 ? t('mobile.outbox.run.sent', { count: run.sent, time: formatTime(run.at) }) : t('mobile.outbox.run.nothing', { time: formatTime(run.at) })}</Notice>
  return <Notice tone={run.stopped === 'auth' ? 'error' : 'warning'}>{t(`mobile.outbox.run.${run.stopped}`, { count: run.sent, reason: run.blocked?.reason ?? '' })}</Notice>
}

const s = StyleSheet.create({
  title: { fontSize: 16, fontFamily: fonts.bold, color: colors.loam900 },
  meta: { fontSize: 14, fontFamily: fonts.body, color: colors.loam600 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  sendingNow: { fontSize: 14, fontFamily: fonts.bold, color: colors.prune700 },
  track: { height: 6, borderRadius: radius.pill, backgroundColor: colors.loam200, overflow: 'hidden' },
  bar: { height: 6, borderRadius: radius.pill, backgroundColor: colors.prune600 },
})
