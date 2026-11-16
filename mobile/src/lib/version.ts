// « Version 1.0.0 (build 14) · mise à jour du 14 novembre 2026 », at the
// bottom of « Mon compte »: what the person has on their phone or tablet,
// to compare with TestFlight or the store. The build number comes from the
// installed app; the date is that of the code it runs (a remote update, or
// the one the build carried).
import Constants from 'expo-constants'
import * as Updates from 'expo-updates'
import { formatDate, t } from './i18n'

export function versionLabel({ version, build, createdAt }: { version: string | null; build: string | null; createdAt: Date | null }): string {
  const values = { version: version ?? '?', build: build ?? '?' }
  return createdAt ? t('mobile.account.version_dated', { ...values, date: formatDate(createdAt.toISOString()) }) : t('mobile.account.version', values)
}

export function currentVersion(): string {
  return versionLabel({
    version: Constants.nativeAppVersion ?? Constants.expoConfig?.version ?? null,
    // Deprecated in favour of expo-application, which would need a new native build to add.
    build: Constants.nativeBuildVersion ?? null,
    createdAt: Updates.createdAt ?? null,
  })
}
