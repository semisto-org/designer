import clsx from 'clsx'
import { forwardRef, type ButtonHTMLAttributes } from 'react'

/**
 * A button that sits in a row of underlined tabs and looks like one of them:
 * « Plus ▾ », which opens the tabs that no longer fit on the line.
 * `active` underlines it when the page shown is one of those it holds.
 */
export const TabButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }>(
  function TabButton({ active, className, type = 'button', ...rest }, ref) {
    return (
      <button
        ref={ref}
        type={type}
        className={clsx(
          '-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-prune-600',
          active ? 'border-prune-600 text-prune-700' : 'border-transparent text-loam-600 hover:border-loam-300 hover:text-loam-900',
          className,
        )}
        {...rest}
      />
    )
  },
)
