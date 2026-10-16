import { formatDate } from '@/lib/money'
import { t } from '@/lib/i18n'
import type { Letterhead as LetterheadData } from '@/types/documents'

/**
 * The top of a document's page, on screen and on paper: the logo of the
 * map's team (or of its pro owner) when there is one, else nothing but the
 * map's name and the date.
 */
export function Letterhead({ letterhead, mapName }: { letterhead: LetterheadData; mapName: string }) {
  return (
    <header className="mb-10 flex items-end justify-between gap-6 border-b border-loam-900/15 pb-4 print:mb-8">
      {letterhead ? (
        <img src={letterhead.logoUrl} alt={letterhead.name} className="max-h-14 max-w-[14rem] object-contain object-left print:max-h-16" />
      ) : <span />}
      <p className="text-right text-sm text-loam-500">{t('documents.markdown.printed_on', { map: mapName, date: formatDate(new Date()) })}</p>
    </header>
  )
}
