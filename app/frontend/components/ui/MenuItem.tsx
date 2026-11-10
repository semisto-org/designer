import clsx from 'clsx'
import { forwardRef, type ButtonHTMLAttributes } from 'react'

/**
 * One line of a small « … » menu (role="menu"): an icon then a label, the
 * whole width of the menu. `danger` for what removes something.
 */
export const MenuItem = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { danger?: boolean }>(
  function MenuItem({ danger, className, type = 'button', ...rest }, ref) {
    return (
      <button
        ref={ref}
        type={type}
        role="menuitem"
        className={clsx(
          'flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left hover:bg-loam-100 focus-visible:outline-2 focus-visible:outline-prune-600 [&_svg]:h-4 [&_svg]:w-4 [&_svg]:shrink-0',
          danger ? 'text-clay-700' : 'text-loam-800',
          className,
        )}
        {...rest}
      />
    )
  },
)
