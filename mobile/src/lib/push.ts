// Discussion messages on the phone (Michael, 2026-11-04): once signed in,
// the app asks once for the right to notify, registers its Expo push token
// with the server (/api/v1/push_devices) and forgets it on sign-out. A tap
// on a notification opens that map's discussion on the message. While the
// discussion of that very map is on screen, a new message does not pop up:
// it is already there.
import Constants from 'expo-constants'
import * as Notifications from 'expo-notifications'
import { router } from 'expo-router'
import { Platform } from 'react-native'
import { api } from './api'
import { chat } from './chat'
import { t } from './i18n'

type ChatData = { type?: string; mapId?: number; commentId?: number }

let token: string | null = null

Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const data = notification.request.content.data as ChatData
    const state = chat.get()
    const onScreen = data?.type === 'chat' && state.visible && state.mapId === data.mapId
    return { shouldShowBanner: !onScreen, shouldShowList: !onScreen, shouldPlaySound: !onScreen, shouldSetBadge: false }
  },
})

/** After sign-in and at each launch: asks once, then keeps the server's copy of the token fresh. */
export async function registerForPush(): Promise<'registered' | 'denied' | 'unavailable'> {
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('discussion', {
        name: t('mobile.push.channel'),
        importance: Notifications.AndroidImportance.HIGH,
      })
    }
    let { status } = await Notifications.getPermissionsAsync()
    if (status === 'undetermined') status = (await Notifications.requestPermissionsAsync()).status
    if (status !== 'granted') return 'denied'
    const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined
    token = (await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined)).data
    await api('POST', '/api/v1/push_devices', { token, platform: Platform.OS })
    return 'registered'
  } catch {
    // A simulator, a build without push credentials, no network: the app works without.
    return 'unavailable'
  }
}

/** Before signing out: this phone stops receiving the account's messages. */
export async function forgetPush(): Promise<void> {
  if (!token) return
  const sent = token
  token = null
  await api('DELETE', '/api/v1/push_devices', { token: sent }).catch(() => undefined)
}

export async function pushPermission(): Promise<'granted' | 'denied' | 'undetermined'> {
  try {
    return (await Notifications.getPermissionsAsync()).status as 'granted' | 'denied' | 'undetermined'
  } catch {
    return 'denied'
  }
}

function open(data: ChatData) {
  if (data?.type !== 'chat' || typeof data.mapId !== 'number') return
  // The terrain first, so closing the discussion lands on the map.
  router.push(`/maps/${data.mapId}`)
  router.push(`/maps/${data.mapId}/chat`)
  if (typeof data.commentId === 'number') chat.openAt(data.commentId)
}

/** A tap on a notification, whether the app was running or not. */
export function listenToPushTaps(): () => void {
  const last = Notifications.getLastNotificationResponse()
  if (last) open(last.notification.request.content.data as ChatData)
  const sub = Notifications.addNotificationResponseReceivedListener((response) => open(response.notification.request.content.data as ChatData))
  return () => sub.remove()
}
