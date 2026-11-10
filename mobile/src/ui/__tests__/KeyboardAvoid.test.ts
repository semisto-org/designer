import { keyboardOverlap } from '@/ui/KeyboardAvoid'

describe('keyboardOverlap', () => {
  it('counts the sheet offset below the status bar', () => {
    // iPhone 14 Pro: sheet from y=59 to the bottom (852), keyboard top at 516.
    expect(keyboardOverlap(59, 793, 516)).toBe(336)
  })

  it('leaves out the bottom space the content already keeps', () => {
    expect(keyboardOverlap(59, 793, 516, 34)).toBe(302)
  })

  it('is zero when the keyboard is below the view or reported at the top of the screen', () => {
    expect(keyboardOverlap(0, 500, 852)).toBe(0)
    expect(keyboardOverlap(59, 793, 0)).toBe(0)
  })
})
