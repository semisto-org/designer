import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { Image, Text } from 'react-native'
import * as SplashScreen from 'expo-splash-screen'
import { haptics } from '@/lib/haptics'
import { EXIT_MS, GROW_AT, GROWN_MS, LOAD_TIMEOUT_MS, Opening } from '../Opening'

let mockReduced = false
jest.mock('react-native-worklets', () => require('react-native-worklets/lib/module/mock'))
jest.mock('react-native-reanimated', () => ({ ...require('react-native-reanimated/mock'), useReducedMotion: () => mockReduced }))
jest.mock('expo-splash-screen', () => ({ hideAsync: jest.fn(() => Promise.resolve()), preventAutoHideAsync: jest.fn() }))
jest.mock('@/lib/haptics', () => ({ haptics: { tap: jest.fn(), select: jest.fn() } }))

beforeEach(() => {
  jest.useFakeTimers()
  jest.clearAllMocks()
  mockReduced = false
})
afterEach(() => jest.useRealTimers())

function render(ready: boolean, onDone = jest.fn()) {
  let tree!: ReactTestRenderer
  act(() => { tree = create(<Opening ready={ready} onDone={onDone} />) })
  return { tree, onDone }
}
const loadAll = (tree: ReactTestRenderer) => act(() => { tree.root.findAllByType(Image).forEach((image) => image.props.onLoadEnd()) })
const caption = (tree: ReactTestRenderer) => tree.root.findAllByType(Text).map((node) => node.props.children).join('')
const advance = (ms: number) => act(() => { jest.advanceTimersByTime(ms) })

it('hides the native splash once its own picture is drawn, then grows the tree year by year', () => {
  const { tree, onDone } = render(true)
  expect(SplashScreen.hideAsync).not.toHaveBeenCalled()
  loadAll(tree)
  expect(SplashScreen.hideAsync).toHaveBeenCalledTimes(1)
  advance(GROW_AT[0])
  expect(caption(tree)).toBe('1 an')
  advance(GROW_AT[3] - GROW_AT[0])
  expect(caption(tree)).toBe('30 ans')
  expect(haptics.select).toHaveBeenCalledTimes(3)
  advance(GROWN_MS - GROW_AT[3])
  expect(onDone).not.toHaveBeenCalled()
  advance(EXIT_MS)
  expect(onDone).toHaveBeenCalledTimes(1)
})

it('hides the splash anyway when a layer never loads', () => {
  render(true)
  advance(LOAD_TIMEOUT_MS)
  expect(SplashScreen.hideAsync).toHaveBeenCalledTimes(1)
})

it('waits for the app before leaving', () => {
  const onDone = jest.fn()
  const { tree } = render(false, onDone)
  loadAll(tree)
  advance(GROWN_MS + EXIT_MS * 3)
  expect(onDone).not.toHaveBeenCalled()
  act(() => { tree.update(<Opening ready onDone={onDone} />) })
  advance(EXIT_MS)
  expect(onDone).toHaveBeenCalledTimes(1)
})

it('only fades when motion is reduced, and a tap skips it', () => {
  mockReduced = true
  const { tree, onDone } = render(true)
  loadAll(tree)
  advance(200)
  expect(onDone).toHaveBeenCalledTimes(1)
  expect(caption(tree)).toBe('')

  mockReduced = false
  const second = render(true)
  loadAll(second.tree)
  act(() => { second.tree.root.findByProps({ testID: 'opening' }).props.onTouchEnd() })
  advance(EXIT_MS)
  expect(second.onDone).toHaveBeenCalledTimes(1)
})
