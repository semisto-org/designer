import clsx from 'clsx'
import type { ReactNode } from 'react'

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={clsx('rounded-xl bg-white p-5 shadow-sm ring-1 ring-loam-200/70', className)}>{children}</div>
}

export function EmptyState({ title, children, action }: { title: ReactNode; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-loam-300 bg-white/60 px-6 py-12 text-center">
      <h3 className="text-base font-semibold text-loam-900">{title}</h3>
      {children && <div className="mx-auto mt-2 max-w-md text-sm text-loam-500">{children}</div>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
