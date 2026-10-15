import clsx from 'clsx'
import type { FormAnswer } from '@/types/forms'

/** An answer to a team's form, written out like a page of the notebook: each question, then what was said. */
export function FormAnswers({ fields, title, className }: { fields: FormAnswer[]; title?: string; className?: string }) {
  return (
    <div className={clsx('rounded-xl bg-[#fffdf7] px-4 py-3 ring-1 ring-loam-900/10', className)}>
      {title && <p className="mb-3 border-b border-loam-300 pb-2 font-serif text-2xl text-loam-900">{title}</p>}
      <dl className="space-y-3">
        {fields.map((field, i) => (
          <div key={i} className="border-b border-dashed border-loam-200 pb-3 last:border-0 last:pb-0">
            <dt className="text-sm font-medium text-loam-600">{field.label}</dt>
            <dd className="mt-0.5 whitespace-pre-line break-words font-serif text-lg leading-snug text-loam-900">{field.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
