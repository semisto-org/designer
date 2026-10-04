import { KeyRound } from 'lucide-react'
import { ButtonLink } from '@/components/ui/Button'
import { tf } from '@/lib/content'
import { formatDate } from '@/lib/money'
import type { IncomingTransfer } from '@/types/transfer'

/** « Mes cartes »: the maps someone proposes me to take over, each with a way to answer. */
export function IncomingTransfers({ transfers }: { transfers: IncomingTransfer[] }) {
  if (transfers.length === 0) return null
  return (
    <ul className="mt-6 space-y-3" aria-label={tf('transfer.notice.list_label')}>
      {transfers.map((transfer) => (
        <li key={transfer.id} className="flex flex-col gap-3 rounded-xl bg-prune-50 p-4 ring-1 ring-prune-200 sm:flex-row sm:items-center">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-white text-prune-600 ring-1 ring-prune-100">
              <KeyRound className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="font-medium text-prune-900">{tf('transfer.notice.banner', { from: transfer.fromName, map: transfer.mapName })}</p>
              <p className="mt-0.5 text-sm text-prune-700">{tf('transfer.notice.banner_until', { date: formatDate(transfer.expiresAt) })}</p>
            </div>
          </div>
          <ButtonLink href={`/maps/${transfer.mapId}/transfers/${transfer.id}`} size="sm" className="ml-13 self-start sm:ml-0 sm:self-auto">
            {tf('transfer.notice.see')}
          </ButtonLink>
        </li>
      ))}
    </ul>
  )
}
