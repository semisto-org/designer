// What is waiting to be sent for this map, and what the server refused
// (with the reason), which the person can send again or drop. After a
// round of sending, it says how it went, and on which change and why it
// stopped: a send that never ends is never silent.
import { useLocalSearchParams } from 'expo-router'
import { useEffect, useState } from 'react'
import { Alert, FlatList, StyleSheet, Text, View } from 'react-native'
import { formatDate, t } from '@/lib/i18n'
import { outbox, type SendRun } from '@/lib/outbox'
import type { Op } from '@/lib/outbox-core'
import { useOnline, useOutbox } from '@/state/sync'
import { Body, Button, Card, Notice, styles } from '@/ui/kit'
import { colors, fonts, space } from '@/ui/theme'

export default function OutboxScreen() {
  const mapId = Number(useLocalSearchParams<{ id: string }>().id)
  const ops = useOutbox().ops.filter((op) => op.mapId === mapId)
  const online = useOnline()
  const [sending, setSending] = useState(false)
  const [run, setRun] = useState<SendRun | null>(outbox.lastRun())
  useEffect(() => outbox.subscribe(() => setRun(outbox.lastRun())), [])
  const blocked = run && run.stopped !== 'done' ? run.blocked : undefined

  const sendNow = async () => {
    setSending(true)
    try { setRun(await outbox.flush()) } finally { setSending(false) }
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
          {online && ops.some((op) => !op.error) && <Button variant="secondary" label={sending ? t('mobile.outbox.sending') : t('mobile.outbox.send_now')} busy={sending} onPress={sendNow} />}
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

/** How the last round went, in words. */
function RunNotice({ run }: { run: SendRun }) {
  if (run.stopped === 'done') return run.sent > 0 ? <Notice tone="info">{t('mobile.outbox.run.sent', { count: run.sent })}</Notice> : null
  return <Notice tone={run.stopped === 'auth' ? 'error' : 'warning'}>{t(`mobile.outbox.run.${run.stopped}`, { count: run.sent, reason: run.blocked?.reason ?? '' })}</Notice>
}

const s = StyleSheet.create({
  title: { fontSize: 16, fontFamily: fonts.bold, color: colors.loam900 },
  meta: { fontSize: 14, fontFamily: fonts.body, color: colors.loam600 },
})
