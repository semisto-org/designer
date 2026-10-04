// An image served by Designer (photos, observation photos): the request
// carries the app's token; the server redirects to a short-lived file link.
import { useEffect, useState } from 'react'
import { Image, type ImageStyle, type StyleProp } from 'react-native'
import { accessToken } from '@/lib/auth'
import { API_URL } from '@/lib/config'
import { colors } from './theme'

export function RemoteImage({ path, local, style }: { path?: string | null; local?: string | null; style?: StyleProp<ImageStyle> }) {
  const [token, setToken] = useState<string | null>(null)
  useEffect(() => {
    if (!local && path) accessToken().then(setToken).catch(() => setToken(null))
  }, [path, local])

  const source = local
    ? { uri: local }
    : path && token ? { uri: `${API_URL}${path}`, headers: { Authorization: `Bearer ${token}` } } : null
  return source
    ? <Image source={source} style={[{ backgroundColor: colors.loam100 }, style]} resizeMode="cover" />
    : <Image style={[{ backgroundColor: colors.loam100 }, style]} />
}
