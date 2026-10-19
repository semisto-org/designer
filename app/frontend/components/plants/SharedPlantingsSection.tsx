import { Link } from '@inertiajs/react'
import { Check, MapPin, Send, Sprout } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Field, Select, Textarea } from '@/components/ui/Field'
import { ApiError, api } from '@/lib/api'
import { t } from '@/lib/i18n'
import type { SharedPlace } from '@/types/plants'

type Asking = { place: SharedPlace; varietyId: number | null; plant: string }

/**
 * « Dans d'autres jardins » on a species sheet: the places whose owners
 * show this plant in the ground, nearest first, and a request for scions,
 * cuttings or seeds to the ones who accept them.
 */
export function SharedPlantingsSection({ places, plantName, speciesId, materials }: { places: SharedPlace[]; plantName: string; speciesId: number; materials: string[] }) {
  const [asking, setAsking] = useState<Asking | null>(null)
  const [asked, setAsked] = useState<Set<string>>(new Set())
  const key = (placeId: number, varietyId: number | null) => `${placeId}:${varietyId ?? ''}`

  return (
    <>
      <p className="mb-3 text-sm text-loam-600">{t('propagation.shared.intro')}</p>
      {places.length === 0 ? (
        <p className="flex gap-2 rounded-lg bg-loam-50 p-3 text-sm text-loam-600">
          <Sprout className="mt-0.5 h-4 w-4 shrink-0 text-leaf-600" />{t('propagation.shared.empty')}
        </p>
      ) : (
        <ul className="divide-y divide-dashed divide-loam-200">
          {places.map((place) => (
            <li key={place.id} className="py-3">
              <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
                <MapPin className="h-4 w-4 shrink-0 self-center text-loam-400" aria-hidden />
                <span className="font-medium text-loam-900">{place.region ? t('propagation.shared.place', { region: place.region }) : t('propagation.shared.place_unknown')}</span>
                {place.distanceKm != null && place.nearMap && (
                  <span className="text-loam-500">{t('propagation.shared.distance', { km: place.distanceKm, map: place.nearMap })}</span>
                )}
              </p>
              <ul className="mt-2 space-y-1.5 pl-6">
                {place.plants.map((plant) => {
                  const name = plant.variety ? `'${plant.variety}'` : t('propagation.shared.no_variety')
                  const done = plant.requested || asked.has(key(place.id, plant.varietyId))
                  return (
                    <li key={plant.varietyId ?? 'none'} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                      <span className="min-w-0 flex-1">
                        <span className={plant.variety ? 'font-medium text-loam-900' : 'text-loam-600'}>{name}</span>
                        <span className="text-loam-500">
                          {' · '}{t('propagation.shared.plants', { count: plant.count })}
                          {plant.since && <>{' · '}{t('propagation.shared.since', { year: plant.since })}</>}
                        </span>
                      </span>
                      {!place.acceptsRequests ? (
                        <span className="text-loam-400">{t('propagation.shared.no_requests')}</span>
                      ) : done ? (
                        <Link href="/propagation" className="inline-flex items-center gap-1 text-leaf-700 hover:underline">
                          <Check className="h-4 w-4" />{t('propagation.shared.asked')}
                        </Link>
                      ) : (
                        <Button size="sm" variant="secondary" onClick={() => setAsking({ place, varietyId: plant.varietyId, plant: plant.variety ? `${plantName} '${plant.variety}'` : plantName })}>
                          <Send className="h-4 w-4" />{t('propagation.shared.ask')}
                        </Button>
                      )}
                    </li>
                  )
                })}
              </ul>
            </li>
          ))}
        </ul>
      )}
      {asking && (
        <RequestDialog
          asking={asking}
          speciesId={speciesId}
          materials={materials}
          onClose={() => setAsking(null)}
          onSent={() => {
            setAsked((previous) => new Set(previous).add(key(asking.place.id, asking.varietyId)))
            setAsking(null)
          }}
        />
      )}
    </>
  )
}

function RequestDialog({ asking, speciesId, materials, onClose, onSent }: { asking: Asking; speciesId: number; materials: string[]; onClose: () => void; onSent: () => void }) {
  const [material, setMaterial] = useState(materials[0] ?? 'scions')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const result = await api<{ message: string }>('/propagation', {
        method: 'POST',
        body: { propagation_request: { map_id: asking.place.id, species_id: speciesId, variety_id: asking.varietyId, material, message } },
      })
      setSent(result.message)
    } catch (err) {
      setError(err instanceof ApiError || err instanceof Error ? err.message : t('collab.share.error'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onClose={sent ? onSent : onClose} dismissOnBackdrop={false} title={t('propagation.shared.dialog_title', { plant: asking.plant })}>
      {sent ? (
        <div className="space-y-4">
          <p className="flex gap-2 rounded-lg bg-leaf-50 p-3 text-sm text-leaf-800"><Check className="mt-0.5 h-4 w-4 shrink-0" />{sent}</p>
          <div className="flex justify-end gap-2">
            <Link href="/propagation" className="self-center text-sm text-prune-700 hover:underline">{t('propagation.shared.see_requests')}</Link>
            <Button onClick={onSent}>{t('common.close')}</Button>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          {error && <p role="alert" className="rounded-lg bg-clay-50 px-3 py-2 text-sm text-clay-700">{error}</p>}
          <Field label={t('propagation.shared.material')}>
            <Select value={material} onChange={(e) => setMaterial(e.target.value)}>
              {materials.map((m) => <option key={m} value={m}>{t(`propagation.materials.${m}`)}</option>)}
            </Select>
          </Field>
          <Field label={t('propagation.shared.message')} hint={t('propagation.shared.message_hint')}>
            <Textarea required rows={5} maxLength={2000} value={message} onChange={(e) => setMessage(e.target.value)} placeholder={t('propagation.shared.message_placeholder')} />
          </Field>
          <div className="flex justify-end">
            <Button type="submit" disabled={busy || message.trim() === ''}><Send className="h-4 w-4" />{t('propagation.shared.send')}</Button>
          </div>
        </form>
      )}
    </Dialog>
  )
}
