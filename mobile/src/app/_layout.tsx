import { EBGaramond_500Medium } from '@expo-google-fonts/eb-garamond'
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, useFonts } from '@expo-google-fonts/inter'
import { Stack } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import { useEffect } from 'react'
import { StatusBar } from 'expo-status-bar'
// Defines the background task of GPS traces: must load with the bundle.
import '@/lib/trace'
import { t } from '@/lib/i18n'
import { SessionProvider, useSession } from '@/state/session'
import { useAutoSync } from '@/state/sync'
import { colors, fonts } from '@/ui/theme'

SplashScreen.preventAutoHideAsync()

function Navigator() {
  const status = useSession()
  const [fontsLoaded, fontError] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, EBGaramond_500Medium })
  const ready = status !== 'loading' && (fontsLoaded || !!fontError)
  useAutoSync()
  useEffect(() => { if (ready) SplashScreen.hideAsync() }, [ready])
  if (!ready) return null
  return (
    <Stack
      screenOptions={{
        headerTintColor: colors.prune700,
        headerStyle: { backgroundColor: colors.loam50 },
        headerTitleStyle: { color: colors.loam900, fontFamily: fonts.title, fontSize: 20 },
        contentStyle: { backgroundColor: colors.loam50 },
        headerBackTitle: t('mobile.common.back'),
      }}
    >
      <Stack.Screen name="index" options={{ title: t('mobile.maps.title') }} />
      <Stack.Screen name="account" options={{ title: t('mobile.account.title') }} />
      <Stack.Screen name="oauth" options={{ headerShown: false }} />
      <Stack.Screen name="maps/[id]/index" options={{ headerShown: false }} />
      <Stack.Screen name="maps/[id]/features/[featureId]" options={{ title: '' }} />
      <Stack.Screen name="maps/[id]/plant" options={{ title: t('mobile.plant.title'), presentation: 'modal' }} />
      <Stack.Screen name="maps/[id]/identify" options={{ title: t('mobile.identify.title'), presentation: 'modal' }} />
      <Stack.Screen name="maps/[id]/record" options={{ title: t('mobile.record.title') }} />
      <Stack.Screen name="maps/[id]/outbox" options={{ title: t('mobile.outbox.title') }} />
    </Stack>
  )
}

export default function RootLayout() {
  return (
    <SessionProvider>
      <StatusBar style="dark" />
      <Navigator />
    </SessionProvider>
  )
}
