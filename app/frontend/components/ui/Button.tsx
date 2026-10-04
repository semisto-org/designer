import clsx from 'clsx'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Link } from '@inertiajs/react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'leaf'
type Size = 'sm' | 'md' | 'lg'

const variants: Record<Variant, string> = {
  primary: 'bg-prune-600 text-white hover:bg-prune-800 focus-visible:outline-prune-600',
  leaf: 'bg-leaf-600 text-white hover:bg-leaf-700 focus-visible:outline-prune-600',
  secondary: 'bg-white text-prune-700 ring-[1.5px] ring-inset ring-prune-600 hover:bg-prune-600 hover:text-white',
  ghost: 'text-prune-700 hover:bg-prune-50',
  danger: 'bg-clay-500 text-white hover:bg-clay-700 focus-visible:outline-clay-500',
}
const sizes: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-sm gap-1.5',
  md: 'px-4 py-2 text-sm gap-2',
  lg: 'min-h-12 px-6 py-3 text-base gap-2',
}

export function buttonClass(variant: Variant = 'primary', size: Size = 'md', extra?: string) {
  return clsx(
    // Pills, as in the Semisto Design System.
    'inline-flex items-center justify-center rounded-full font-semibold transition-colors duration-200 active:scale-[0.98]',
    'focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50 disabled:pointer-events-none',
    variants[variant],
    sizes[size],
    extra,
  )
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }

export function Button({ variant, size, className, type = 'button', ...rest }: ButtonProps) {
  return <button type={type} className={buttonClass(variant, size, className)} {...rest} />
}

export function ButtonLink({
  href, variant, size, className, children, method,
}: { href: string; variant?: Variant; size?: Size; className?: string; children: ReactNode; method?: 'get' | 'post' | 'delete' }) {
  return (
    <Link href={href} method={method} as={method && method !== 'get' ? 'button' : 'a'} className={buttonClass(variant, size, className)}>
      {children}
    </Link>
  )
}
