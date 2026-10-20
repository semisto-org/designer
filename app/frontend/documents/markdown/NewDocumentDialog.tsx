import { router } from '@inertiajs/react'
import { BookOpenText, FilePen, Footprints } from 'lucide-react'
import { useState } from 'react'
import { Dialog } from '@/components/ui/Dialog'
import { api, ApiError } from '@/lib/api'
import { t } from '@/lib/i18n'
import { formatDate } from '@/lib/money'
import type { MapDocumentData } from '@/types/documents'

const TEMPLATES = [
  { key: 'visit', icon: Footprints },
  { key: 'journal', icon: BookOpenText },
  { key: 'blank', icon: FilePen },
] as const

// « Printemps 2027 », « Hiver 2026–2027 »: the journal opens on today's season.
export function seasonLabel(date: Date): string {
  const month = date.getMonth()
  const year = date.getFullYear()
  if (month <= 1) return t('photo_pages.seasons.winter', { from: year - 1, to: year })
  if (month === 11) return t('photo_pages.seasons.winter', { from: year, to: year + 1 })
  return t(`photo_pages.seasons.${month <= 4 ? 'spring' : month <= 7 ? 'summer' : 'autumn'}`, { year })
}

/**
 * « Nouveau document »: a blank page or one already laid out to help (a
 * visit report that asks what the place says, a garden journal that grows
 * season after season). It opens at once, ready to write.
 */
export function NewDocumentDialog({ open, onClose, endpoint, tags }: { open: boolean; onClose: () => void; endpoint: string; tags: string[] }) {
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function create(key: string) {
    setBusy(key)
    setError(null)
    const now = new Date()
    const vars = { date: formatDate(now), season: seasonLabel(now) }
    try {
      const doc = await api<MapDocumentData>(endpoint, {
        method: 'POST',
        body: { document: { markdown: true, title: t(`documents.markdown.templates.${key}.title`, vars), content: t(`documents.markdown.templates.${key}.body`, vars), tags } },
      })
      router.visit(`${endpoint}/${doc.id}?edit=1&new=1`)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('documents.errors.generic'))
      setBusy(null)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title={t('documents.markdown.choose_title')}>
      <p className="text-loam-600">{t('documents.markdown.choose_intro')}</p>
      <ul className="mt-4 space-y-2">
        {TEMPLATES.map(({ key, icon: Icon }) => (
          <li key={key}>
            <button type="button" disabled={busy !== null} onClick={() => void create(key)}
              className="flex w-full items-start gap-3 rounded-xl bg-[#fbf8f1] px-4 py-3 text-left ring-1 ring-loam-900/10 transition-colors hover:bg-prune-50 hover:ring-prune-300 disabled:opacity-60">
              <Icon className="mt-0.5 h-5 w-5 shrink-0 text-leaf-600" aria-hidden />
              <span>
                <span className="block font-serif text-lg text-loam-900">{busy === key ? t('documents.markdown.creating') : t(`documents.markdown.templates.${key}.name`)}</span>
                <span className="block text-sm text-loam-600">{t(`documents.markdown.templates.${key}.hint`)}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {error && <p className="mt-3 text-sm text-clay-600" role="alert">{error}</p>}
    </Dialog>
  )
}
