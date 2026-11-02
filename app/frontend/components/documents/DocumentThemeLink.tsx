import { Link } from '@inertiajs/react'
import { ArrowRight, Palette } from 'lucide-react'
import { t } from '@/lib/i18n'

/** The way to the « Charte graphique » page, from « Mon compte » or a team's page. */
export function DocumentThemeLink({ href, team }: { href: string; team?: boolean }) {
  return (
    <Link href={href} className="group flex items-center gap-4 rounded-2xl border border-loam-200 bg-white px-4 py-3.5 shadow-sm transition hover:border-prune-300">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-leaf-100 text-leaf-700"><Palette className="h-5 w-5" aria-hidden="true" /></span>
      <span className="min-w-0 flex-1">
        <span className="block font-serif text-xl text-loam-900 group-hover:text-prune-700">{t('document_themes.title')}</span>
        <span className="block text-sm text-loam-600">{t(team ? 'document_themes.card_hint_team' : 'document_themes.card_hint')}</span>
      </span>
      <ArrowRight className="h-5 w-5 shrink-0 text-loam-400 group-hover:text-prune-600" aria-hidden="true" />
    </Link>
  )
}
