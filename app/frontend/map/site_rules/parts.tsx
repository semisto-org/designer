import { ExternalLink, Sprout } from 'lucide-react'
import type { ReactNode } from 'react'
import { t } from '@/lib/i18n'

/** An outbound link to an official page, opened in a new tab. */
export function OfficialLink({ href, children }: { href: string | null; children: ReactNode }) {
  if (!href) return null
  return (
    <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-prune-700 hover:underline">
      {children}<ExternalLink className="h-3 w-3" aria-hidden />
    </a>
  )
}

/** The forest-garden reading of a rule, as a note in the margin of the notebook. */
export function GardenNote({ children }: { children: ReactNode }) {
  if (!children) return null
  return (
    <p className="mt-1.5 flex gap-1.5 text-[13px] leading-snug text-loam-700">
      <Sprout className="mt-0.5 h-3.5 w-3.5 shrink-0 text-leaf-600" aria-hidden />
      <span>{children}</span>
    </p>
  )
}

/** A section title with, in the margin, a handwritten note like in a field notebook. */
export function SectionTitle({ children, note }: { children: ReactNode; note?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <h3 className="font-serif text-lg text-loam-900">{children}</h3>
      {note && <span className="font-hand text-lg leading-none text-leaf-600">{note}</span>}
    </div>
  )
}

export function SubTitle({ children }: { children: ReactNode }) {
  return <h4 className="text-xs font-semibold uppercase tracking-wide text-loam-500">{children}</h4>
}

/** "26 février 2026" from an ISO date. */
export function formatDate(iso: string | null): string | null {
  if (!iso) return null
  const date = new Date(`${iso}T12:00:00`)
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}

export function reasonText(reason: string) {
  return t(`site_rules.reasons.${reason}`)
}
