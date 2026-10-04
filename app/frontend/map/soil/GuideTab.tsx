import { ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { t, translations } from '@/lib/i18n'

const SECTIONS = [
  { id: 'why', ordered: false },
  { id: 'when', ordered: false },
  { id: 'where', ordered: true },
  { id: 'how', ordered: true },
  { id: 'ask', ordered: false },
  { id: 'jar', ordered: true },
  { id: 'after', ordered: true },
] as const

type SectionText = { title: string; intro?: string; steps?: Record<string, string>; note?: string }

/** The sampling guide: free for everyone, written for someone who has never sent soil to a lab. */
export default function GuideTab({ onStart }: { onStart: () => void }) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-loam-600">{t('soil.guide.lead')}</p>
      <div className="divide-y divide-loam-100 rounded-xl border border-loam-100">
        {SECTIONS.map(({ id, ordered }) => {
          const text = translations(`soil.guide.sections.${id}`) as SectionText
          const steps = Object.values(text.steps ?? {})
          const List = ordered ? 'ol' : 'ul'
          return (
            <details key={id} className="group px-3 py-2.5" open={id === 'how'}>
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-sm font-medium text-loam-800 [&::-webkit-details-marker]:hidden">
                {text.title}
                <ChevronDown className="h-4 w-4 shrink-0 text-loam-400 transition-transform group-open:rotate-180" aria-hidden />
              </summary>
              <div className="mt-2 space-y-2 text-sm text-loam-600">
                {text.intro && <p>{text.intro}</p>}
                {steps.length > 0 && (
                  <List className={ordered ? 'list-decimal space-y-1.5 pl-5' : 'list-disc space-y-1.5 pl-5'}>
                    {steps.map((step, index) => <li key={index}>{step}</li>)}
                  </List>
                )}
                {text.note && <p className="rounded-lg bg-humus-50 p-2.5 text-xs text-humus-700">{text.note}</p>}
              </div>
            </details>
          )
        })}
      </div>
      <Button size="sm" onClick={onStart}>{t('soil.guide.cta')}</Button>
    </div>
  )
}
