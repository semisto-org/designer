// Home: sign in, then the person's maps, each downloadable for the terrain.
import { Link, router, Stack } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import { FlatList, Image, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native'
import { signIn, type SignInResult } from '@/lib/auth'
import { formatDate, t } from '@/lib/i18n'
import { cachedBundle, cachedMaps, downloadMap, downloadState, fetchMaps, type DownloadState } from '@/lib/maps'
import type { MapSummary } from '@/lib/types'
import { useSession } from '@/state/session'
import { useOnline } from '@/state/sync'
import { Body, Button, Card, Notice, styles, Title } from '@/ui/kit'
import { colors, fonts, space } from '@/ui/theme'

export default function Home() {
  return useSession() === 'signed_in' ? <MapList /> : <SignIn />
}

function SignIn() {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<SignInResult | null>(null)
  const online = useOnline()
  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.content, { paddingTop: 48 }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <Image source={require('../../assets/images/icon.png')} style={{ width: 72, height: 72, borderRadius: 16 }} />
      <Title>{t('mobile.sign_in.title')}</Title>
      <Body>{t('mobile.sign_in.intro')}</Body>
      {!online && <Notice tone="warning">{t('mobile.sign_in.offline')}</Notice>}
      {result === 'denied' && <Notice tone="warning">{t('mobile.sign_in.denied')}</Notice>}
      {result === 'failed' && <Notice tone="error">{t('mobile.sign_in.failed')}</Notice>}
      <Button
        label={t('mobile.sign_in.button')}
        busy={busy}
        disabled={!online}
        onPress={async () => {
          setBusy(true)
          setResult(await signIn().catch(() => 'failed' as const))
          setBusy(false)
        }}
      />
      <Body muted>{t('mobile.sign_in.how')}</Body>
    </ScrollView>
  )
}

function MapList() {
  const [maps, setMaps] = useState<MapSummary[]>(() => cachedMaps())
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(false)
  const online = useOnline()

  const refresh = useCallback(async () => {
    setRefreshing(true)
    try {
      setMaps(await fetchMaps())
      setError(false)
    } catch {
      setError(true)
    } finally {
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { if (online) void refresh() }, [online, refresh])

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{
        headerRight: () => (
          <Link href="/account" asChild>
            <Pressable accessibilityRole="button" hitSlop={12}><Text style={{ color: colors.prune600, fontSize: 16 }}>{t('mobile.account.title')}</Text></Pressable>
          </Link>
        ),
      }} />
      <FlatList
        data={maps}
        keyExtractor={(map) => String(map.id)}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
        ListHeaderComponent={
          <View style={{ gap: space.sm }}>
            {!online && <Notice tone="warning">{t('mobile.maps.offline')}</Notice>}
            {online && error && <Notice tone="error">{t('mobile.maps.failed')}</Notice>}
          </View>
        }
        ListEmptyComponent={!refreshing ? <Card><Body>{t('mobile.maps.empty')}</Body></Card> : null}
        renderItem={({ item }) => <MapRow map={item} online={online} />}
      />
    </View>
  )
}

function MapRow({ map, online }: { map: MapSummary; online: boolean }) {
  const [download, setDownload] = useState<DownloadState | null>(null)
  const [failed, setFailed] = useState(false)
  const hasBundle = !!cachedBundle(map.id)

  useEffect(() => { downloadState(map.id).then(setDownload).catch(() => setDownload(null)) }, [map.id])

  const ready = download?.state === 'complete' && hasBundle
  return (
    <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/maps/[id]', params: { id: String(map.id) } })}>
      <Card style={{ gap: space.sm }}>
        <Text style={{ fontSize: 20, fontFamily: fonts.title, color: colors.loam900 }}>{map.name}</Text>
        <Body muted>
          {[map.address, t(`mobile.roles.${map.role}`), t('mobile.maps.updated', { date: formatDate(map.updatedAt) })].filter(Boolean).join(' · ')}
        </Body>
        {map.readOnlyByPlan && <Notice tone="warning">{t('mobile.maps.read_only_by_plan')}</Notice>}
        {ready ? (
          <Body style={{ color: colors.leaf700 } as object}>{t('mobile.maps.downloaded')}</Body>
        ) : download?.state === 'active' ? (
          <Body muted>{t('mobile.maps.downloading', { percent: download.percentage })}</Body>
        ) : (
          <Button
            variant="secondary"
            label={t(failed ? 'mobile.maps.download_retry' : 'mobile.maps.download')}
            disabled={!online}
            onPress={async () => {
              setFailed(false)
              setDownload({ state: 'active', percentage: 0, bytes: 0 })
              try {
                await downloadMap(map, setDownload)
              } catch {
                setFailed(true)
                setDownload(null)
              }
            }}
          />
        )}
      </Card>
    </Pressable>
  )
}
