// Small vibrations that confirm a gesture without looking at the screen
// (gloves, sun). Silent where the phone has none.
import * as Haptics from 'expo-haptics'

const safely = (run: () => Promise<void>) => { run().catch(() => undefined) }

export const haptics = {
  /** A feature or an option chosen. */
  select: () => safely(() => Haptics.selectionAsync()),
  /** A point placed, a button pressed. */
  tap: () => safely(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  /** Something saved or sent. */
  success: () => safely(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  warning: () => safely(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
}
