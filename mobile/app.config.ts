// The base config is app.json. APP_VARIANT=preview (EAS profiles
// « testflight » and « preview ») builds a separate test app, « Designer
// (test) », that installs next to the store one and has its own bundle
// identifier, so testers can try it before the organisation's account exists.
// On Android it is org.semisto.designertest, the package the Play Console
// test app was created with.
// The URL scheme stays the same: the server's OAuth redirect must match it.
import type { ConfigContext, ExpoConfig } from 'expo/config'

const PREVIEW = process.env.APP_VARIANT === 'preview'

export default ({ config }: ConfigContext): ExpoConfig => {
  const base = config as ExpoConfig
  if (!PREVIEW) return base
  return {
    ...base,
    name: 'Designer (test)',
    ios: { ...base.ios, bundleIdentifier: 'org.semisto.designer.preview' },
    android: { ...base.android, package: 'org.semisto.designertest' },
  }
}
