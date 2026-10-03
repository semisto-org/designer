import { ChevronDown } from 'lucide-react'

export type FaqItem = { q: string; a: string }

/** Questions and answers as native disclosure elements: they work without JavaScript and for crawlers. */
export function Faq({ items }: { items: FaqItem[] }) {
  return (
    <div className="divide-y divide-loam-200 rounded-xl bg-white ring-1 ring-loam-200/70">
      {items.map((item) => (
        <details key={item.q} className="group px-5 py-4">
          <summary className="flex cursor-pointer list-none items-start justify-between gap-4 text-left font-medium text-loam-900 [&::-webkit-details-marker]:hidden">
            <span className="text-pretty">{item.q}</span>
            <ChevronDown className="mt-0.5 h-5 w-5 shrink-0 text-loam-400 transition-transform group-open:rotate-180" aria-hidden="true" />
          </summary>
          <p className="mt-3 max-w-3xl text-pretty leading-relaxed text-loam-500">{item.a}</p>
        </details>
      ))}
    </div>
  )
}
