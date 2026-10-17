// When a screen breaks: say so plainly, keep what is waiting to be sent
// (it is on the phone), and offer to start again.
import { View } from 'react-native'
import { t } from '@/lib/i18n'
import { Body, Button, styles, Title } from './kit'
import { space } from './theme'

export function ErrorScreen({ onRetry }: { onRetry: () => void }) {
  return (
    <View style={[styles.screen, { justifyContent: 'center', padding: space.xl, gap: space.md }]}>
      <Title>{t('mobile.error.title')}</Title>
      <Body>{t('mobile.error.body')}</Body>
      <Button label={t('mobile.error.retry')} onPress={onRetry} />
    </View>
  )
}
