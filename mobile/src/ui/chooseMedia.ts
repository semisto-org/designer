// « Photo, vidéo »: what to add to the map's photos (a photo, a video, or
// files already in the gallery), asked in one native dialog.
import { Alert, Platform } from 'react-native'
import { t } from '@/lib/i18n'
import { pickMedia, takePhoto, takeVideo, type PickedMedia } from '@/lib/photos'

export type MediaChoice = PickedMedia & { from: 'camera' | 'library' }

/** Null when the person cancels; videos over the limit are named in an alert. */
export function chooseMedia(): Promise<MediaChoice | null> {
  return new Promise((resolve) => {
    const done = (run: () => Promise<PickedMedia | null>, from: MediaChoice['from']) => async () => {
      const picked = await run().catch(() => null)
      if (picked?.tooLarge.length) Alert.alert(t('mobile.media.too_large_title'), t('mobile.media.too_large', { names: picked.tooLarge.join(' », « ') }))
      resolve(picked && picked.items.length > 0 ? { ...picked, from } : null)
    }
    const photo = async () => {
      const taken = await takePhoto()
      return taken && { items: [taken], tooLarge: [] }
    }
    Alert.alert(t('mobile.media.title'), t('mobile.media.body'), [
      { text: t('mobile.media.photo'), onPress: done(photo, 'camera') },
      { text: t('mobile.media.video'), onPress: done(takeVideo, 'camera') },
      { text: t('mobile.media.library'), onPress: done(() => pickMedia(), 'library') },
      // Android shows three buttons at most: there, a tap outside cancels.
      ...(Platform.OS === 'ios' ? [{ text: t('mobile.common.cancel'), style: 'cancel' as const, onPress: () => resolve(null) }] : []),
    ], { cancelable: true, onDismiss: () => resolve(null) })
  })
}
