// Who is signed in, signing out, and asking Semisto to delete the account
// (the stores require it from inside the app).
import { router } from 'expo-router'
import { useEffect, useState } from 'react'
import { Alert, Linking, ScrollView } from 'react-native'
import { ApiError, api } from '@/lib/api'
import { signOut } from '@/lib/auth'
import { API_URL } from '@/lib/config'
import { t } from '@/lib/i18n'
import { outbox } from '@/lib/outbox'
import { Body, Button, Card, Notice, styles, Title } from '@/ui/kit'

type Me = { user: { name: string | null; email: string } }

export default function Account() {
  const [me, setMe] = useState<Me | null>(null)
  useEffect(() => { api<Me>('GET', '/api/v1/me').then(setMe).catch(() => undefined) }, [])
  const [deletion, setDeletion] = useState<{ tone: 'info' | 'error'; message: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const waiting = outbox.pending()

  const requestDeletion = async () => {
    setBusy(true)
    try {
      const { message } = await api<{ message: string }>('POST', '/api/v1/me/deletion_request')
      setDeletion({ tone: 'info', message })
    } catch (e) {
      const body = e instanceof ApiError ? e.body : null
      setDeletion({ tone: 'error', message: String(body?.message ?? t('mobile.account.delete_failed')) })
    } finally {
      setBusy(false)
    }
  }

  const confirmDeletion = () => Alert.alert(t('mobile.account.delete_title'), t('mobile.account.delete_body'), [
    { text: t('mobile.common.cancel'), style: 'cancel' },
    { text: t('mobile.account.delete_confirm'), style: 'destructive', onPress: requestDeletion },
  ])

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Card>
        <Title>{me?.user.name || me?.user.email || t('mobile.account.unknown')}</Title>
        {me && <Body muted>{me.user.email}</Body>}
      </Card>
      <Button variant="secondary" label={t('mobile.account.website')} onPress={() => Linking.openURL(`${API_URL}/maps`)} />
      {waiting > 0 && <Notice tone="warning">{t('mobile.account.pending_changes', { count: waiting })}</Notice>}
      <Button
        variant="danger"
        label={t('mobile.account.sign_out')}
        onPress={async () => {
          await signOut()
          router.replace('/')
        }}
      />
      {deletion
        ? <Notice tone={deletion.tone}>{deletion.message}</Notice>
        : null}
      {deletion?.tone !== 'info' && <Button variant="ghost" label={t('mobile.account.delete')} busy={busy} onPress={confirmDeletion} />}
    </ScrollView>
  )
}
