import { Check, Copy } from 'lucide-react'
import { useState } from 'react'
import { t } from '@/lib/i18n'

/** A value to copy (URL, command, token) with its copy button. */
export function CopyField({ value, className, mono }: { value: string; className?: string; mono?: boolean }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }
  return (
    <div className={'flex min-w-0 items-stretch overflow-hidden rounded-lg ring-1 ring-loam-200 ' + (className ?? '')}>
      <code className={'min-w-0 flex-1 overflow-x-auto whitespace-nowrap bg-loam-50 px-3 py-2 text-sm text-loam-800 ' + (mono ? 'font-mono' : '')}>{value}</code>
      <button
        type="button"
        onClick={copy}
        className="flex shrink-0 items-center gap-1.5 border-l border-loam-200 bg-white px-3 text-sm text-loam-700 hover:bg-loam-100"
        aria-label={t('copy_field.copy')}
      >
        {copied ? <Check className="h-4 w-4 text-leaf-600" /> : <Copy className="h-4 w-4" />}
        <span className="hidden sm:inline">{copied ? t('copy_field.copied') : t('copy_field.copy')}</span>
      </button>
    </div>
  )
}
