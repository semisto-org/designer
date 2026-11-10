// Keeps the bottom of a screen (a chat composer, a save button) above the iOS keyboard.
//
// React Native's KeyboardAvoidingView compares the keyboard's position on the screen with the
// view's layout relative to its parent. In a screen presented as a sheet (`presentation: 'modal'`)
// the sheet starts below the status bar, so the two disagree by that offset and the keyboard ends
// up covering the composer. This view measures itself in window coordinates every time the
// keyboard moves, so it is right in a sheet, a full screen or a modal pushed on top of another.
//
// Android resizes the window itself (adjustResize), so nothing is done there.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { AccessibilityInfo, Keyboard, LayoutAnimation, Platform, View, type KeyboardEvent, type StyleProp, type ViewStyle } from 'react-native'

/** How far the keyboard reaches into a view whose window frame is `top`/`height`. */
export function keyboardOverlap(top: number, height: number, keyboardTop: number, reserved = 0): number {
  if (keyboardTop <= 0) return 0
  return Math.max(0, Math.round(top + height - keyboardTop - reserved))
}

export function KeyboardAvoid({ style, reserved = 0, children }: {
  style?: StyleProp<ViewStyle>
  /** Bottom space the content already keeps (the home indicator's safe area), covered by the keyboard anyway. */
  reserved?: number
  children: ReactNode
}) {
  const ref = useRef<View>(null)
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
      ref.current?.measureInWindow((_x, top, _width, height) => apply(keyboardOverlap(top, height, screenY, reservedRef.current)))
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
    <View ref={ref} style={style}>
      <View style={{ flex: 1, paddingBottom: bottom }}>{children}</View>
    </View>
  )
}
