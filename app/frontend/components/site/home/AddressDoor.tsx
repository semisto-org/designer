import { Loader2 } from 'lucide-react'
import { tf } from '@/lib/content'
import { AddressSearch } from '@/map/data/AddressSearch'
import { useStartTrial } from '@/trials/start'

/**
 * The home page's front door: an address opens the visitor's own place at
 * once, without an account (a trial, origin `home`). The hero and the last
 * section both use it.
 */
export function AddressDoor({ className }: { className?: string }) {
  const { start, starting, error } = useStartTrial({ via: 'home' })
  return (
    <div className={className}>
      <AddressSearch
        size="lg"
        endpoint="/essai/geocode"
        label={tf('site.home.hero.label')}
        placeholder={tf('site.home.hero.placeholder')}
        submitLabel={tf('site.home.hero.submit')}
        onSelect={(place) => void start(place)}
      />
      {starting && (
        <p className="mt-3 inline-flex items-center gap-2 text-loam-600" role="status">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          {tf('site.home.hero.starting')}
        </p>
      )}
      {error && <p className="mt-3 text-clay-600" role="alert">{error}</p>}
    </div>
  )
}
