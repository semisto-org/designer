import clsx from 'clsx'
import { AlertTriangle, Drone, EyeOff } from 'lucide-react'
import type { ReactNode } from 'react'
import { HelpButton } from '@/components/help/HelpButton'
import { useAerialViews } from '@/drone/AerialViewsOverlay'
import { aerialViewLabel } from '@/drone/format'
import { aerialStore, useAerialState } from '@/drone/store'
import { t } from '@/lib/i18n'

export const DRONE_HELP_SLUG = 'la-vue-drone'

/**
 * « Vues drone » in the « Couches » panel, under the base maps: the map's
 * dated drone views, newest first, one at a time over the chosen base map,
 * with its opacity. Shown to everyone who can open the map; nothing when
 * the map has no view.
 */
export default function AerialViewsChoice() {
  const views = useAerialViews()
  const state = useAerialState()
  if (views.length === 0) return null
  const selected = views.find((v) => v.id === state.viewId) ?? null
  const opacity = Math.round(state.opacity * 100)

  return (
    <section aria-labelledby="layers-aerial-title">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 id="layers-aerial-title" className="text-xs font-semibold uppercase tracking-wide text-loam-500">
          {t('drone.layers.title')}
        </h3>
        <HelpButton slug={DRONE_HELP_SLUG} iconOnly label={t('drone.layers.help')} className="-my-1 px-1.5! py-1!" />
      </div>
      <div role="radiogroup" aria-labelledby="layers-aerial-title" className="space-y-1.5">
        {views.map((view) => (
          <Choice key={view.id} checked={state.viewId === view.id} onSelect={() => aerialStore.select(view.id)} icon={<Drone className="h-4 w-4" aria-hidden="true" />}>
            {aerialViewLabel(view)}
          </Choice>
        ))}
        <Choice checked={state.viewId == null} onSelect={() => aerialStore.select(null)} icon={<EyeOff className="h-4 w-4" aria-hidden="true" />}>
          {t('drone.layers.none')}
        </Choice>
      </div>
      {selected && (
        state.errors.includes(selected.id) ? (
          <p className="mt-2 flex items-start gap-1.5 text-xs text-humus-700" role="status">
            <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {t('drone.layers.unreachable')}
          </p>
        ) : (
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={opacity}
            onChange={(e) => aerialStore.setOpacity(Number(e.target.value) / 100)}
            aria-label={t('drone.layers.opacity')}
            aria-valuetext={`${opacity} %`}
            className="mt-3 h-1.5 w-full cursor-pointer accent-prune-600"
          />
        )
      )}
      <p className="mt-2 text-xs text-loam-500">{t(views.length > 1 ? 'drone.layers.hint_many' : 'drone.layers.hint_one')}</p>
    </section>
  )
}

function Choice({ checked, onSelect, icon, children }: { checked: boolean; onSelect: () => void; icon: ReactNode; children: ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      onClick={onSelect}
      className={clsx(
        'flex min-h-11 w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm ring-1 ring-inset transition-colors',
        checked ? 'bg-prune-50 font-medium text-prune-800 ring-prune-400' : 'bg-white text-loam-700 ring-loam-200 hover:bg-loam-50',
      )}
    >
      <span className={clsx('shrink-0', checked ? 'text-prune-600' : 'text-loam-400')}>{icon}</span>
      <span className="leading-tight">{children}</span>
    </button>
  )
}
