import type { ReactNode } from 'react'

/**
 * A button label that stays folded behind its icon and unrolls when the
 * button is hovered (pointer devices only) or focused with the keyboard.
 * The parent must carry the `group` class and an `aria-label`: the label
 * itself is hidden from assistive tech so it is not read twice.
 */
export function RevealLabel({ children }: { children: ReactNode }) {
  return (
    <span
      aria-hidden="true"
      className="grid grid-cols-[0fr] transition-[grid-template-columns] duration-300 ease-out motion-reduce:transition-none group-hover:grid-cols-[1fr] group-focus-visible:grid-cols-[1fr]"
    >
      <span className="overflow-hidden whitespace-nowrap">
        <span className="block pl-1.5 pr-0.5 opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-focus-visible:opacity-100">{children}</span>
      </span>
    </span>
  )
}
