import { Head, router } from '@inertiajs/react'
import clsx from 'clsx'
import { ArrowRight } from 'lucide-react'
import { useState } from 'react'
import { content, tf } from '@/lib/content'
import { formatPrice } from '@/lib/money'

type Kind = 'individual' | 'professional'

type Props = {
  name: string | null
  accountKind: Kind | null
  prices: Record<string, number>
}

/**
 * Asked once after the first sign-in: does the person design their own place
 * or for clients? Two facing pages of the field notebook, one per answer.
 */
export default function Welcome({ name, accountKind, prices }: Props) {
  const [sending, setSending] = useState<Kind | null>(null)
  const vars = { yearly: formatPrice(prices.yearly ?? 0), atelier: formatPrice(prices.atelier ?? 0), bureau: formatPrice(prices.bureau ?? 0) }
  const choose = (kind: Kind) => {
    setSending(kind)
    router.patch('/welcome', { account_kind: kind }, { onFinish: () => setSending(null) })
  }

  return (
    <div className="mx-auto max-w-5xl py-4 sm:py-10">
      <Head title={tf('welcome.title')} />
      <p className="font-hand text-2xl text-leaf-600">{name ? tf('welcome.kicker', { name }) : tf('welcome.kicker_anonymous')}</p>
      <h1 className="mt-1 text-balance text-3xl font-medium leading-tight text-prune-900 sm:text-4xl">{tf('welcome.heading')}</h1>
      <p className="mt-3 max-w-2xl text-pretty text-loam-500">{tf('welcome.intro')}</p>

      <div className="mt-10 grid overflow-hidden rounded-2xl bg-[#fbf8f1] shadow-sm ring-1 ring-loam-200 md:grid-cols-2">
        {(['individual', 'professional'] as const).map((kind) => (
          <NotebookPage
            key={kind}
            kind={kind}
            vars={vars}
            current={accountKind === kind}
            sending={sending === kind}
            disabled={sending !== null}
            onChoose={() => choose(kind)}
          />
        ))}
      </div>

      <p className="mt-6 text-center font-hand text-xl text-loam-500">{tf('welcome.later')}</p>
    </div>
  )
}

function NotebookPage({ kind, vars, current, sending, disabled, onChoose }: {
  kind: Kind
  vars: Record<string, string>
  current: boolean
  sending: boolean
  disabled: boolean
  onChoose: () => void
}) {
  const points = content<string[]>(`welcome.${kind}.points`, vars)
  const left = kind === 'individual'

  return (
    <section
      className={clsx(
        'relative flex flex-col p-6 sm:p-10',
        // The notebook's spine between the two pages; a dashed fold on phones.
        left ? 'border-b border-dashed border-loam-300 md:border-b-0 md:border-r md:border-solid md:border-loam-200 md:shadow-[inset_-18px_0_24px_-24px_rgba(60,40,30,0.35)]'
          : 'md:shadow-[inset_18px_0_24px_-24px_rgba(60,40,30,0.35)]',
        current && 'bg-leaf-50/60'
      )}
      aria-labelledby={`welcome-${kind}`}
    >
      <p className="text-sm font-semibold uppercase tracking-wide text-leaf-600">{tf(`welcome.${kind}.label`)}</p>
      <h2 id={`welcome-${kind}`} className="mt-1 font-serif text-2xl font-semibold leading-snug text-prune-900">{tf(`welcome.${kind}.title`)}</h2>
      <p className="mt-2 text-pretty text-sm leading-relaxed text-loam-500">{tf(`welcome.${kind}.who`)}</p>

      <div className="mt-6 text-prune-700">
        {left ? <OwnPlaceSketch /> : <ClientPlacesSketch />}
        <p className="mt-1 rotate-[-2deg] text-right font-hand text-lg text-leaf-600">{tf(`welcome.${kind}.note`)}</p>
      </div>

      <ul className="mt-6 flex-1 space-y-3">
        {points.map((point) => (
          <li key={point} className="flex gap-3 text-sm leading-relaxed text-loam-700">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-leaf-500" aria-hidden="true" />
            <span>{point}</span>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={onChoose}
        disabled={disabled}
        aria-pressed={current}
        className={clsx(
          'mt-8 inline-flex items-center justify-center gap-2 self-start rounded-full px-5 py-2.5 text-sm font-medium transition-colors disabled:opacity-60',
          left ? 'bg-prune-600 text-white hover:bg-prune-700' : 'bg-white text-prune-700 ring-1 ring-inset ring-prune-200 hover:bg-prune-50'
        )}
      >
        {tf(`welcome.${kind}.submit`)}
        <ArrowRight className={clsx('h-4 w-4', sending && 'animate-pulse')} aria-hidden="true" />
      </button>
    </section>
  )
}

// One plot, a house, and the same tree drawn at years 1, 5 and 15.
function OwnPlaceSketch() {
  return (
    <svg viewBox="0 20 320 96" className="h-24 w-full" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 98 C 60 92, 120 101, 190 95 S 290 99, 306 96" className="text-loam-400" />
      <path d="M38 98 V72 L56 58 L74 72 V98" />
      <path d="M50 98 V84 H62 V98" />
      <g className="text-leaf-600">
        <path d="M128 98 V88" />
        <path d="M128 88 c -5 -2 -5 -9 0 -10 c 5 1 5 8 0 10" />
        <path d="M188 98 V76" />
        <path d="M188 78 c -13 -2 -15 -20 -2 -24 c 2 -7 12 -6 13 1 c 10 4 6 22 -11 23" />
        <path d="M262 98 V64" />
        <path d="M262 68 c -24 -1 -30 -26 -12 -34 c 1 -12 18 -16 25 -6 c 16 -2 22 18 8 26 c 2 10 -9 16 -21 14" />
      </g>
      <g className="text-loam-400" strokeWidth="1.2">
        <path d="M120 110 h16 M180 110 h16 M254 110 h16" />
      </g>
    </svg>
  )
}

// Three clients' plots, each at its own stage, pinned side by side.
function ClientPlacesSketch() {
  return (
    <svg viewBox="0 20 320 96" className="h-24 w-full" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 30 L96 22 L104 92 L24 100 Z" />
      <path d="M40 76 c 8 -10 22 -8 26 2 c 10 -2 16 8 8 14" className="text-leaf-600" />
      <path d="M122 26 L200 30 L196 98 L116 94 Z" />
      <path d="M134 50 h50 M134 62 h40 M134 74 h46" className="text-loam-400" strokeDasharray="4 4" />
      <path d="M222 22 L300 28 L294 100 L216 92 Z" />
      <g className="text-leaf-600">
        <path d="M244 82 c -10 -2 -12 -16 -2 -20 c 2 -8 14 -8 16 0 c 10 2 8 18 -6 20" />
        <path d="M274 74 c -6 -1 -7 -10 -1 -12 c 1 -5 9 -5 10 0 c 6 2 5 11 -4 12" />
      </g>
      <g className="text-clay-500">
        <circle cx="58" cy="24" r="3" />
        <circle cx="160" cy="28" r="3" />
        <circle cx="262" cy="24" r="3" />
      </g>
    </svg>
  )
}
