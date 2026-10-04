// Who is signed in, and signing out.
import { router } from 'expo-router'
import { useEffect, useState } from 'react'
import { Linking, ScrollView } from 'react-native'
import { api } from '@/lib/api'
import { signOut } from '@/lib/auth'
import { API_URL } from '@/lib/config'
import { t } from '@/lib/i18n'
import { outbox } from '@/lib/outbox'
import { Body, Button, Card, Notice, styles, Title } from '@/ui/kit'

type Me = { user: { name: string | null; email: string } }

export default function Account() {
  const [me, setMe] = useState<Me | null>(null)
  useEffect(() => { api<Me>('GET', '/api/v1/me').then(setMe).catch(() => undefined) }, [])
  const waiting = outbox.pending()
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
    </ScrollView>
  )
}
