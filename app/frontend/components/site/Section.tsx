import clsx from 'clsx'
import type { ReactNode } from 'react'

/** A full-width band of the public site, with the content held to the page width. */
export function Section({ children, tone = 'plain', className, id }: {
  children: ReactNode
  tone?: 'plain' | 'white' | 'prune' | 'leaf'
  className?: string
  id?: string
}) {
  const tones = {
    plain: '',
    white: 'bg-white border-y border-loam-200/70',
    prune: 'bg-prune-900 text-prune-50',
    leaf: 'bg-leaf-50 border-y border-leaf-100',
  }
  return (
    <section id={id} className={clsx('scroll-mt-20', tones[tone], className)}>
      <div className="mx-auto max-w-6xl px-4 py-14 sm:py-20">{children}</div>
    </section>
  )
}

/** `tone="dark"` on a dark background: a light green that stays readable. */
export function Eyebrow({ children, className, tone = 'plain' }: { children: ReactNode; className?: string; tone?: 'plain' | 'dark' }) {
  return <p className={clsx('text-sm font-semibold uppercase tracking-wider', tone === 'dark' ? 'text-leaf-300' : 'text-leaf-600', className)}>{children}</p>
}

export function SectionHeading({ eyebrow, title, intro, center, className, tone = 'plain' }: {
  eyebrow?: ReactNode
  title: ReactNode
  intro?: ReactNode
  center?: boolean
  className?: string
  tone?: 'plain' | 'dark'
}) {
  return (
    <div className={clsx('max-w-2xl', center && 'mx-auto text-center', className)}>
      {eyebrow && <Eyebrow tone={tone}>{eyebrow}</Eyebrow>}
      <h2 className={clsx('mt-2 text-balance text-2xl leading-tight sm:text-3xl', tone === 'dark' && 'text-white')}>{title}</h2>
      {intro && <p className={clsx('mt-3 text-pretty text-base leading-relaxed sm:text-lg', tone === 'dark' ? 'text-prune-200' : 'text-loam-500')}>{intro}</p>}
    </div>
  )
}

/** The head of an inner page (features, pricing…): a title over a soft gradient. */
export function PageHero({ eyebrow, title, lead, children }: { eyebrow?: ReactNode; title: ReactNode; lead?: ReactNode; children?: ReactNode }) {
  return (
    <header className="border-b border-loam-200/70 bg-gradient-to-b from-prune-50 to-loam-50">
      <div className="mx-auto max-w-6xl px-4 pb-12 pt-14 sm:pb-16 sm:pt-20">
        <div className="max-w-3xl">
          {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
          <h1 className="mt-2 text-balance text-3xl leading-tight tracking-tight sm:text-5xl">{title}</h1>
          {lead && <p className="mt-4 text-pretty text-lg leading-relaxed text-loam-500">{lead}</p>}
          {children && <div className="mt-6">{children}</div>}
        </div>
      </div>
    </header>
  )
}

/** The closing call to action of a page. */
export function CtaBand({ title, body, children }: { title: ReactNode; body?: ReactNode; children: ReactNode }) {
  return (
    <Section tone="prune">
      <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
        <h2 className="text-balance text-2xl text-white sm:text-3xl">{title}</h2>
        {body && <p className="mt-3 text-pretty text-lg text-prune-200">{body}</p>}
        <div className="mt-7 flex flex-wrap justify-center gap-3">{children}</div>
      </div>
    </Section>
  )
}
