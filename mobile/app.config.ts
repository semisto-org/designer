// The base config is app.json. APP_VARIANT=preview (EAS profiles
// « testflight » and « preview ») builds a separate test app, « Designer
// (test) », that installs next to the store one and has its own bundle
// identifier, so testers can try it before the organisation's account exists.
// The URL scheme stays the same: the server's OAuth redirect must match it.
import type { ConfigContext, ExpoConfig } from 'expo/config'

const PREVIEW = process.env.APP_VARIANT === 'preview'

export default ({ config }: ConfigContext): ExpoConfig => {
  const base = config as ExpoConfig
  if (!PREVIEW) return base
  const id = 'org.semisto.designer.preview'
  return {
    ...base,
    name: 'Designer (test)',
    ios: { ...base.ios, bundleIdentifier: id },
    android: { ...base.android, package: id },
  }
}
