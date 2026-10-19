import { Link } from '@inertiajs/react'
import { Sprout } from 'lucide-react'
import { HelpButton } from '@/components/help/HelpButton'
import { api } from '@/lib/api'
import { t } from '@/lib/i18n'
import type { SharingData } from '@/types/collab'

type Run = (request: () => Promise<SharingData>, success?: string) => Promise<boolean>

/**
 * « Le lieu et ses plantes » in the « Partager » dialog: who owns the place,
 * and, for them alone, whether other gardeners see the plants in the ground
 * and may ask for scions, cuttings or seeds. Everyone else reads the choices.
 */
export function PlaceSection({ data, manager, busy, base, run }: { data: SharingData; manager: boolean; busy: boolean; base: string; run: Run }) {
  const place = data.place
  const save = (body: Record<string, boolean>) =>
    void run(() => api<SharingData>(`${base}/place_sharing`, { method: 'PATCH', body: { place_sharing: body } }), t('propagation.place.saved'))

  return (
    <section aria-labelledby="share-place" className="space-y-3 border-t border-loam-100 pt-4">
      <div className="flex items-center justify-between gap-2">
        <h3 id="share-place" className="flex items-center gap-1.5 text-sm font-semibold text-loam-900">
          <Sprout className="h-4 w-4 text-leaf-600" />{t('propagation.place.title')}
        </h3>
        <HelpButton compact slug="partager-ses-plantes-et-les-multiplier" />
      </div>
      <p className="text-sm text-loam-600">{t('propagation.place.intro')}</p>
      {place.owners.length > 0 ? (
        <p className="text-sm text-loam-800">{t('propagation.place.owners', { names: place.owners.join(', ') })}</p>
      ) : (
        <p className="rounded-lg bg-loam-50 px-3 py-2 text-sm text-loam-600">{t(manager ? 'propagation.place.no_owner_manager' : 'propagation.place.no_owner')}</p>
      )}

      {place.you ? (
        <div className="space-y-3 rounded-2xl bg-leaf-50/60 p-3 ring-1 ring-leaf-100">
          <Switch
            label={t('propagation.place.share')}
            hint={t('propagation.place.share_hint')}
            checked={place.sharesPlantedPalette}
            disabled={busy}
            onChange={(checked) => save({ shares_planted_palette: checked })}
          />
          <Switch
            label={t('propagation.place.requests')}
            hint={place.sharesPlantedPalette ? t('propagation.place.requests_hint') : t('propagation.place.requests_need_share')}
            checked={place.acceptsPropagationRequests}
            disabled={busy || !place.sharesPlantedPalette}
            onChange={(checked) => save({ accepts_propagation_requests: checked })}
          />
          {place.acceptsPropagationRequests && (
            <p className="text-sm">
              <Link href="/propagation" className="font-medium text-prune-700 underline-offset-2 hover:underline">
                {place.pendingRequests ? t('propagation.place.pending', { count: place.pendingRequests }) : t('propagation.place.open_requests')}
              </Link>
            </p>
          )}
        </div>
      ) : place.owners.length > 0 && (
        <p className="text-sm text-loam-600">
          {place.sharesPlantedPalette ? t('propagation.place.shared_state') : t('propagation.place.private_state')}
          {place.acceptsPropagationRequests && <> {t('propagation.place.requests_state')}</>}
        </p>
      )}
    </section>
  )
}

function Switch({ label, hint, checked, disabled, onChange }: { label: string; hint: string; checked: boolean; disabled: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className={`flex items-start justify-between gap-3 ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
      <span>
        <span className="block text-sm font-medium text-loam-900">{label}</span>
        <span className="block text-sm text-loam-600">{hint}</span>
      </span>
      <span className="relative mt-0.5 inline-flex shrink-0 items-center">
        <input type="checkbox" role="switch" className="peer sr-only" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
        <span className="h-6 w-11 rounded-full bg-loam-200 transition peer-checked:bg-leaf-500 peer-disabled:opacity-50 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-prune-600" />
        <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition peer-checked:translate-x-5" />
      </span>
    </label>
  )
}
