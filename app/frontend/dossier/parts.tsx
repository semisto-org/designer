import clsx from 'clsx'
import type { ReactNode } from 'react'
import { PlanGate } from '@/components/billing/PlanGate'
import { t } from '@/lib/i18n'
import type { Dossier } from '@/types/dossier'

/**
 * One numbered section of the document. The title and its short intro stay
 * together, and with what follows, on paper.
 */
export function Section({ id, number, title, intro, children, className }: {
  id: string; number: number; title: string; intro?: ReactNode; children: ReactNode; className?: string
}) {
  return (
    <section id={`dossier-${id}`} aria-labelledby={`dossier-${id}-title`} className={clsx('dossier-section mt-10 first:mt-0 print:mt-8', className)}>
      <div className="dossier-heading">
        <h2 id={`dossier-${id}-title`} className="flex items-baseline gap-3 border-b-2 border-prune-600 pb-1.5 text-xl text-loam-900">
          <span className="text-base font-semibold tabular-nums text-prune-600">{number}.</span>
          {title}
        </h2>
        {intro && <p className="mt-4 text-xs leading-relaxed text-loam-500">{intro}</p>}
      </div>
      <div className="mt-4 space-y-4 text-sm leading-relaxed text-loam-700">{children}</div>
    </section>
  )
}

export function SubTitle({ children }: { children: ReactNode }) {
  return <h3 className="dossier-heading text-xs font-semibold uppercase tracking-wide text-loam-500">{children}</h3>
}

/** A grid of key figures. */
export function Facts({ items, columns = 3 }: { items: [string, ReactNode, string?][]; columns?: 2 | 3 | 4 }) {
  const shown = items.filter(([, value]) => value != null && value !== '')
  if (shown.length === 0) return null
  return (
    <dl className={clsx('dossier-keep grid grid-cols-2 gap-2', columns === 3 && 'sm:grid-cols-3 print:grid-cols-3', columns === 4 && 'sm:grid-cols-4 print:grid-cols-4')}>
      {shown.map(([label, value, hint]) => (
        <div key={label} className="rounded-lg bg-loam-50 px-3 py-2 print:border print:border-loam-200 print:bg-white">
          <dt className="text-[11px] leading-tight text-loam-500">{label}</dt>
          <dd className="mt-0.5 font-medium text-loam-900">{value}</dd>
          {hint && <dd className="text-[11px] leading-tight text-loam-500">{hint}</dd>}
        </div>
      ))}
    </dl>
  )
}

export function Indicative() {
  return (
    <span className="ml-1.5 inline-block rounded bg-loam-100 px-1.5 py-px align-middle text-[10px] font-medium uppercase tracking-wide text-loam-600 print:border print:border-loam-300 print:bg-white">
      {t('dossier.indicative')}
    </span>
  )
}

/** Shown instead of a paid block: on screen only, never on paper. */
export function LockedNote({ feature, dossier, isOwner }: { feature: 'dossier_terrain' | 'dossier_climate' | 'dossier_soil'; dossier: Dossier; isOwner: boolean }) {
  return (
    <PlanGate
      feature={feature}
      place={{ id: dossier.map.id, name: dossier.map.name, boundary: dossier.cover.boundary }}
      canUpgrade={isOwner}
      className="max-w-xl"
    />
  )
}

export function Muted({ children }: { children: ReactNode }) {
  return <p className="text-sm text-loam-500">{children}</p>
}

export function Table({ head, children, className }: { head: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className="-mx-1 overflow-x-auto px-1 print:mx-0 print:overflow-visible print:px-0">
      <table className={clsx('w-full border-collapse text-sm', className)}>
        <thead>
          <tr className="border-b border-loam-300 text-left text-[11px] uppercase tracking-wide text-loam-500">{head}</tr>
        </thead>
        {children}
      </table>
    </div>
  )
}

export function Th({ children, className }: { children?: ReactNode; className?: string }) {
  return <th scope="col" className={clsx('py-1.5 pr-3 font-medium last:pr-0', className)}>{children}</th>
}

export function Td({ children, className }: { children?: ReactNode; className?: string }) {
  return <td className={clsx('py-1.5 pr-3 align-top last:pr-0', className)}>{children}</td>
}

/** "12,5" with the French decimal comma and a proper minus sign. */
const decimal = new Intl.NumberFormat('fr-BE', { maximumFractionDigits: 1 })
export const fr = (value: number) => decimal.format(value).replace('-', '−')
