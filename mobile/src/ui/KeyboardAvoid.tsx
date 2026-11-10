// Keeps the bottom of a screen (a chat composer, a save button) above the iOS keyboard.
//
// For a view whose bottom edge is the bottom of the screen: a full screen, or a screen presented
// as a sheet (`presentation: 'modal'`), which iOS always draws down to the bottom edge. The
// keyboard then covers exactly its own height of that view, whatever the view's position.
//
// Neither React Native's KeyboardAvoidingView nor measureInWindow can be trusted in a sheet:
// both work from the layout React knows, which starts at the top of the sheet, not below the
// status bar where iOS actually draws it. The first version of this file measured the view and
// still ended up about 60 pt short (PR #400).
//
// Android resizes the window itself (adjustResize), so nothing is done there.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { AccessibilityInfo, Dimensions, Keyboard, LayoutAnimation, Platform, View, type KeyboardEvent, type StyleProp, type ViewStyle } from 'react-native'

/**
 * The padding that lifts content above a keyboard whose top edge is at `keyboardTop` on a screen
 * `screenHeight` tall, less what the content already keeps. A keyboard sliding away (top at the
 * bottom of the screen or below) gives zero.
 */
export function keyboardPadding(keyboardTop: number, screenHeight: number, reserved = 0): number {
  return Math.max(0, Math.round(screenHeight - keyboardTop - reserved))
}

export function KeyboardAvoid({ style, reserved = 0, children }: {
  style?: StyleProp<ViewStyle>
  /** Bottom space the content already keeps (the home indicator's safe area), covered by the keyboard anyway. */
  reserved?: number
  children: ReactNode
}) {
  const [bottom, setBottom] = useState(0)
  const reservedRef = useRef(reserved)
  reservedRef.current = reserved

  useEffect(() => {
    if (Platform.OS !== 'ios') return
    let alive = true
    const update = (event: KeyboardEvent, hiding: boolean) => {
      const { screenY } = event.endCoordinates
      const apply = (next: number) => {
        if (!alive) return
        if (event.duration) {
          LayoutAnimation.configureNext({
            duration: Math.max(event.duration, 10),
            update: { duration: Math.max(event.duration, 10), type: LayoutAnimation.Types[event.easing] ?? 'keyboard' },
          })
        }
        setBottom(next)
      }
      if (hiding) { apply(0); return }
      // With « Prefer cross-fade transitions », iOS reports the keyboard at the top of the screen.
      if (screenY === 0) {
        void AccessibilityInfo.prefersCrossFadeTransitions().then((fade) => { if (fade) apply(0) })
        return
      }
      apply(keyboardPadding(screenY, Dimensions.get('screen').height, reservedRef.current))
    }
    const subscriptions = [
      Keyboard.addListener('keyboardWillChangeFrame', (event) => update(event, false)),
      Keyboard.addListener('keyboardWillHide', (event) => update(event, true)),
    ]
    return () => {
      alive = false
      subscriptions.forEach((subscription) => subscription.remove())
    }
  }, [])

  return (
    <View style={style}>
      <View style={{ flex: 1, paddingBottom: bottom }}>{children}</View>
    </View>
  )
}
