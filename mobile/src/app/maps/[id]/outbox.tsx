// What is waiting to be sent for this map, and what the server refused
// (with the reason), which the person can drop.
import { useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { Alert, FlatList, StyleSheet, Text, View } from 'react-native'
import { formatDate, t } from '@/lib/i18n'
import { outbox } from '@/lib/outbox'
import type { Op } from '@/lib/outbox-core'
import { useOnline, useOutbox } from '@/state/sync'
import { Body, Button, Card, Notice, styles } from '@/ui/kit'
import { colors, fonts, space } from '@/ui/theme'

export default function OutboxScreen() {
  const mapId = Number(useLocalSearchParams<{ id: string }>().id)
  const ops = useOutbox().ops.filter((op) => op.mapId === mapId)
  const online = useOnline()
  const [sending, setSending] = useState(false)

  const sendNow = async () => {
    setSending(true)
    try { await outbox.flush() } finally { setSending(false) }
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
          {online && ops.some((op) => !op.error) && <Button variant="secondary" label={t('mobile.outbox.send_now')} busy={sending} onPress={sendNow} />}
        </View>
      }
      ListEmptyComponent={<Body muted>{t('mobile.outbox.empty')}</Body>}
      renderItem={({ item: op }) => (
        <Card style={{ gap: space.xs, padding: space.md }}>
          <Text style={s.title}>{t(`mobile.outbox.ops.${op.type}`)}</Text>
          <Text style={s.meta}>{formatDate(op.createdAt)}</Text>
          {op.error
            ? <>
                <Notice tone="error">{op.error === 'parent_failed' ? t('mobile.outbox.parent_failed') : t('mobile.outbox.refused', { reason: op.error })}</Notice>
                <Button variant="danger" label={t('mobile.outbox.discard')} onPress={() => discard(op)} />
              </>
            : <Text style={s.meta}>{t('mobile.outbox.waiting')}</Text>}
        </Card>
      )}
    />
  )
}

const s = StyleSheet.create({
  title: { fontSize: 16, fontFamily: fonts.bold, color: colors.loam900 },
  meta: { fontSize: 13, fontFamily: fonts.body, color: colors.loam600 },
})
