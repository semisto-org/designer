import { keyboardPadding } from '@/ui/KeyboardAvoid'

// iPhone 14 Pro: 852 pt tall, keyboard with suggestions from y = 516.
describe('keyboardPadding', () => {
  it('lifts the content by the whole keyboard, wherever the sheet starts', () => {
    expect(keyboardPadding(516, 852)).toBe(336)
  })

  it('leaves out the bottom space the content already keeps', () => {
    expect(keyboardPadding(516, 852, 26)).toBe(310)
  })

  it('is zero once the keyboard has left the screen', () => {
    expect(keyboardPadding(852, 852, 26)).toBe(0)
    expect(keyboardPadding(1188, 852)).toBe(0)
  })
})
