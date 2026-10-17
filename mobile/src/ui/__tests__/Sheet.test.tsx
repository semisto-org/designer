import 'react-native-gesture-handler/jestSetup'
import { act, create } from 'react-test-renderer'
import { Text } from 'react-native'
import { Sheet } from '../Sheet'
jest.mock('react-native-worklets', () => require('react-native-worklets/lib/module/mock'))
jest.mock('react-native-reanimated', () => ({ ...require('react-native-reanimated/mock'), useReducedMotion: () => true }))
jest.mock('@/lib/haptics', () => ({ haptics: { tap: jest.fn(), select: jest.fn() } }))
it('moves between its heights by tap and by the screen reader’s swipes', () => {
  const onLevel = jest.fn()
  let tree!: ReturnType<typeof create>
  act(() => { tree = create(<Sheet level={0} onLevel={onLevel} bottomInset={0} topInset={80} top={<Text>top</Text>}><Text>body</Text></Sheet>) })
  const handle = tree.root.find((n) => n.props.accessibilityRole === 'adjustable')
  act(() => { handle.props.onAccessibilityAction({ nativeEvent: { actionName: 'increment' } }) })
  expect(onLevel).toHaveBeenCalledWith(1)
  act(() => { handle.props.onPress() })
  expect(handle.props.accessibilityValue.text).toBe('réduite')
})
