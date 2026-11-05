// Who is signed in, the discussion's notifications on this phone, signing
// out, and asking Semisto to delete the account (the stores require it from
// inside the app).
import { router } from 'expo-router'
import { useEffect, useState } from 'react'
import { Alert, Linking, ScrollView, StyleSheet, Switch, Text, View } from 'react-native'
import { ApiError, api } from '@/lib/api'
import { signOut } from '@/lib/auth'
import { API_URL } from '@/lib/config'
import { t } from '@/lib/i18n'
import { outbox } from '@/lib/outbox'
import { forgetPush, pushPermission, registerForPush } from '@/lib/push'
import { Body, Button, Card, Heading, Notice, styles, Title } from '@/ui/kit'
import { colors, fonts } from '@/ui/theme'

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
      <PushCard />
      <Button variant="secondary" label={t('mobile.account.website')} onPress={() => Linking.openURL(`${API_URL}/maps`)} />
      {waiting > 0 && <Notice tone="warning">{t('mobile.account.pending_changes', { count: waiting })}</Notice>}
      <Button
        variant="danger"
        label={t('mobile.account.sign_out')}
        onPress={async () => {
          await forgetPush()
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

type Preferences = { app: boolean; email: boolean; push: boolean }

/** « Sur ce téléphone »: the account's switch for the phone, and the system's permission. */
function PushCard() {
  const [prefs, setPrefs] = useState<Preferences | null>(null)
  const [permission, setPermission] = useState<'granted' | 'denied' | 'undetermined' | null>(null)
  useEffect(() => {
    api<Preferences>('GET', '/notification_preference').then(setPrefs).catch(() => undefined)
    void pushPermission().then(setPermission)
  }, [])

  const toggle = async (push: boolean) => {
    setPrefs((current) => current && { ...current, push })
    try {
      setPrefs(await api<Preferences>('PATCH', '/notification_preference', { push }))
      if (push && permission !== 'granted') {
        await registerForPush()
        setPermission(await pushPermission())
      }
    } catch {
      setPrefs((current) => current && { ...current, push: !push })
    }
  }

  return (
    <Card>
      <Heading>{t('mobile.push.title')}</Heading>
      <View style={s.row}>
        <Text style={s.rowLabel}>{t('mobile.push.switch')}</Text>
        <Switch value={!!prefs?.push} disabled={!prefs} onValueChange={(push) => void toggle(push)} trackColor={{ true: colors.prune600 }} />
      </View>
      <Body muted>{t('mobile.push.hint')}</Body>
      {prefs?.push && permission === 'denied' && (
        <>
          <Notice tone="warning">{t('mobile.push.denied')}</Notice>
          <Button variant="secondary" label={t('mobile.push.open_settings')} onPress={() => void Linking.openSettings()} />
        </>
      )}
    </Card>
  )
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 8 },
  rowLabel: { flex: 1, fontFamily: fonts.body, fontSize: 16, color: colors.loam900 },
})
