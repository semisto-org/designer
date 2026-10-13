import clsx from 'clsx'
import type { ComponentProps, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'

export const inputClass =
  'block w-full rounded-lg border-0 bg-white px-3 py-2 text-sm text-loam-900 ring-1 ring-inset ring-loam-900/20 ' +
  'placeholder:text-loam-400 focus:ring-2 focus:ring-inset focus:ring-prune-600'

export function Field({ label, error, hint, children, className }: {
  label?: ReactNode; error?: string | string[]; hint?: ReactNode; children: ReactNode; className?: string
}) {
  const message = Array.isArray(error) ? error[0] : error
  return (
    <label className={clsx('block space-y-1', className)}>
      {label && <span className="block text-sm font-medium text-loam-700">{label}</span>}
      {children}
      {hint && !message && <span className="block text-sm text-loam-500">{hint}</span>}
      {message && <span className="block text-sm text-clay-600">{message}</span>}
    </label>
  )
}

export function Input(props: ComponentProps<'input'>) {
  return <input {...props} className={clsx(inputClass, props.className)} />
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={clsx(inputClass, props.className)} />
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={clsx(inputClass, 'pr-8', props.className)} />
}
