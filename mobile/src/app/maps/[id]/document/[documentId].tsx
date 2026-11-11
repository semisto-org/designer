// A picture joined to a message on the website (often a screenshot), read
// in full: on a dark ground, pinch to zoom into its details.
// « Ouvrir l'original » hands the full file to the system browser, to save
// or share it.
import { router, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { Alert, Platform, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { documentPath } from '@/lib/chat-core'
import { openDocument } from '@/lib/documents'
import { t } from '@/lib/i18n'
import { useOnline } from '@/state/sync'
import { Button, IconButton, MAX_FONT_SCALE } from '@/ui/kit'
import { RemoteImage } from '@/ui/RemoteImage'
import { colors, fonts, space } from '@/ui/theme'

export default function ChatDocumentScreen() {
  const params = useLocalSearchParams<{ id: string; documentId: string; title?: string }>()
  const mapId = Number(params.id)
  const documentId = Number(params.documentId)
  const insets = useSafeAreaInsets()
  const { width, height } = useWindowDimensions()
  const online = useOnline()
  const [zoomed, setZoomed] = useState(false)

  const open = () => {
    void openDocument(mapId, documentId).catch(() => Alert.alert(t('mobile.chat.document_failed')))
  }

  return (
    <View style={s.screen}>
      {/* iOS zooms a ScrollView with two fingers. */}
      <ScrollView style={StyleSheet.absoluteFill} contentContainerStyle={{ width, height }}
        maximumZoomScale={5} minimumZoomScale={1} centerContent bouncesZoom
        showsHorizontalScrollIndicator={false} showsVerticalScrollIndicator={false}
        onScroll={(event) => setZoomed(event.nativeEvent.zoomScale > 1.01)} scrollEventThrottle={64}>
        <RemoteImage path={documentPath(mapId, documentId, 'large')} fit="contain"
          style={{ width, height: height - insets.top - insets.bottom - 140, marginTop: insets.top + 64, backgroundColor: 'transparent' }} />
      </ScrollView>
      <View style={[s.bar, { paddingTop: insets.top + space.sm }]}>
        <Text style={s.title} numberOfLines={1} maxFontSizeMultiplier={MAX_FONT_SCALE}>{params.title || t('mobile.chat.document')}</Text>
        <IconButton icon="close" label={t('mobile.chat.document_close')} onPress={() => router.back()} />
      </View>
      <View style={[s.foot, { paddingBottom: insets.bottom + space.md }]}>
        {Platform.OS === 'ios' && !zoomed && <Text style={s.hint} maxFontSizeMultiplier={MAX_FONT_SCALE}>{t('mobile.chat.document_zoom_hint')}</Text>}
        <Button variant="secondary" icon="document" label={t('mobile.chat.document_open')} disabled={!online} onPress={open} />
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.loam900 },
  bar: {
    position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', gap: space.md,
    paddingHorizontal: space.md, paddingBottom: space.sm, backgroundColor: 'rgba(0,0,0,0.35)',
  },
  title: { flex: 1, fontFamily: fonts.medium, fontSize: 16, color: colors.white },
  foot: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center', gap: space.sm, paddingHorizontal: space.md },
  hint: { fontFamily: fonts.body, fontSize: 14, color: colors.loam200 },
})
