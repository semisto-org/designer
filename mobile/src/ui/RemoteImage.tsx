// An image served by Terranova (photos, observation photos): the request
// carries the app's token; the server redirects to a short-lived file link.
// Kept on disk under its path (not the link, which changes), so photos seen
// once still show on the terrain without network.
import { Image, type ImageStyle } from 'expo-image'
import { useEffect, useState } from 'react'
import type { StyleProp } from 'react-native'
import { accessToken } from '@/lib/auth'
import { API_URL } from '@/lib/config'
import { colors } from './theme'

export function RemoteImage({ path, local, style, onSize }: {
  path?: string | null; local?: string | null; style?: StyleProp<ImageStyle>
  /** The image's own size once loaded, for a photo whose size the map does not know. */
  onSize?: (width: number, height: number) => void
}) {
  const [token, setToken] = useState<string | null>(null)
  useEffect(() => {
    if (!local && path) accessToken().then(setToken).catch(() => setToken(null))
  }, [path, local])

  const source = local
    ? { uri: local }
    : path ? { uri: `${API_URL}${path}`, cacheKey: path, headers: token ? { Authorization: `Bearer ${token}` } : undefined } : null
  return (
    <Image source={source} style={[{ backgroundColor: colors.loam100 }, style]} contentFit="cover" cachePolicy="disk" transition={180}
      onLoad={onSize ? (event) => onSize(event.source.width, event.source.height) : undefined}
      accessibilityIgnoresInvertColors />
  )
}
