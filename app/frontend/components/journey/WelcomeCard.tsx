import { Plus } from 'lucide-react'
import { ButtonLink } from '@/components/ui/Button'
import { STEP_ICONS, stageLabel } from '@/components/journey/JourneyParts'
import { t } from '@/lib/i18n'
import type { MapStage } from '@/types'

const STEPS: MapStage[] = ['observe', 'map', 'design', 'plant']

/** What a new person sees on /maps: the four steps and one button to begin. */
export function WelcomeCard({ canCreate }: { canCreate: boolean }) {
  return (
    <section className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-loam-200/70">
      <div className="bg-gradient-to-br from-leaf-50 via-white to-prune-50 px-6 py-8 sm:px-10 sm:py-10">
        <h2 className="max-w-2xl text-2xl text-loam-900">{t('journey.welcome.title')}</h2>
        <p className="mt-3 max-w-2xl text-loam-600">{t('journey.welcome.intro')}</p>
      </div>
      <div className="px-6 py-6 sm:px-10">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-loam-500">{t('journey.welcome.steps_title')}</h3>
        <ol className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, index) => {
            const Icon = STEP_ICONS[step]
            return (
              <li key={step} className="flex gap-3 lg:block">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-leaf-50 text-leaf-600">
                  <Icon className="h-5 w-5" aria-hidden />
                </span>
                <div className="lg:mt-3">
                  <p className="font-semibold text-loam-900">
                    <span className="text-loam-500">{index + 1}. </span>{stageLabel(step)}
                  </p>
                  <p className="mt-0.5 text-sm text-loam-500">{t(`journey.steps.${step}.summary`)}</p>
                </div>
              </li>
            )
          })}
        </ol>
        <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2">
          {canCreate
            ? <ButtonLink href="/maps/new" size="lg"><Plus className="h-5 w-5" aria-hidden />{t('journey.welcome.create')}</ButtonLink>
            : <ButtonLink href="/billing" variant="secondary" size="lg">{t('journey.welcome.upgrade')}</ButtonLink>}
          <p className="text-sm text-loam-500">{t('journey.welcome.free_note')}</p>
        </div>
      </div>
    </section>
  )
}
