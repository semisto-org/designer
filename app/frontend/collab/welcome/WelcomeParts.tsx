import { Check, Sprout } from 'lucide-react'
import { t, translations } from '@/lib/i18n'
import type { InvitationWelcome } from '@/types/collab'

/** « Martine t'invite à y travailler ensemble, comme éditeur ou éditrice. » */
export function invitedLine(welcome: InvitationWelcome) {
  const role = t(`collab.joining.welcome.roles.${welcome.role}`)
  return welcome.inviterName
    ? t(`collab.joining.welcome.invited_by.${welcome.role}`, { name: welcome.inviterName, role })
    : t('collab.joining.welcome.invited', { role })
}

/** What the person will be able to do there, by role; the discussion when they are in it. */
export function WelcomeAbilities({ welcome }: { welcome: InvitationWelcome }) {
  const lines = Object.values(translations(`collab.joining.welcome.can.${welcome.role}`)).map(String)
  if (welcome.chat) lines.push(t('collab.joining.welcome.can.chat'))
  lines.push(t('collab.joining.welcome.can.phone'))
  return (
    <div>
      <p className="text-sm font-medium uppercase tracking-wide text-loam-500">{t('collab.joining.welcome.can_title')}</p>
      <ul className="mt-2 space-y-1.5">
        {lines.map((line) => (
          <li key={line} className="flex gap-2 text-loam-700">
            <Check className="mt-1 h-4 w-4 shrink-0 text-leaf-600" aria-hidden />
            <span>{line}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** The time of the garden: since when it is designed, what grows there already, what is to come. */
export function WelcomeTime({ welcome }: { welcome: InvitationWelcome }) {
  const date = new Date(`${welcome.since}T12:00:00`).toLocaleDateString('fr-BE', { month: 'long', year: 'numeric' })
  const planned = welcome.plants - welcome.plantsInGround
  const plants = welcome.plants === 0
    ? t('collab.joining.welcome.plants_none')
    : planned === 0
      ? t('collab.joining.welcome.plants_all_in_ground', { count: welcome.plantsInGround })
      : welcome.plantsInGround === 0
        ? t('collab.joining.welcome.plants_planned', { count: planned })
        : t('collab.joining.welcome.plants_mixed', { in_ground: welcome.plantsInGround, planned })
  return (
    <div className="flex gap-3 rounded-2xl bg-leaf-50 p-4 text-leaf-900 ring-1 ring-leaf-200">
      <Sprout className="mt-0.5 h-5 w-5 shrink-0 text-leaf-600" aria-hidden />
      <p>
        {t('collab.joining.welcome.since', { date })} {plants}
        {welcome.plants > 0 && <> {t('collab.joining.welcome.crowns')}</>}
      </p>
    </div>
  )
}
