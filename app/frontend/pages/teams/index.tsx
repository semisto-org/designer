import { Head, Link, useForm } from '@inertiajs/react'
import { ChevronRight, Plus, UsersRound } from 'lucide-react'
import { HelpButton } from '@/components/help/HelpButton'
import { Button } from '@/components/ui/Button'
import { Card, EmptyState } from '@/components/ui/Card'
import { Field, Input } from '@/components/ui/Field'
import { t } from '@/lib/i18n'
import type { TeamSummary } from '@/types/teams'

/** "Mes équipes": the teams I belong to, and creating one. */
export default function TeamsIndex({ teams }: { teams: TeamSummary[] }) {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Head title={t('teams.index.title')} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl">{t('teams.index.title')}</h1>
        <HelpButton slug="travailler-en-equipe" />
      </div>
      <p className="max-w-2xl text-sm text-loam-600">{t('teams.index.intro')}</p>

      {teams.length === 0 ? (
        <EmptyState title={t('teams.index.empty_title')}>{t('teams.index.empty_body')}</EmptyState>
      ) : (
        <ul className="space-y-3">
          {teams.map((team) => (
            <li key={team.id}>
              <Link
                href={`/teams/${team.id}`}
                className="flex items-center gap-4 rounded-xl bg-white p-4 shadow-sm ring-1 ring-loam-200/70 transition hover:ring-prune-300 sm:p-5"
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-prune-50 text-prune-600">
                  <UsersRound className="h-5 w-5" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-base">{team.name}</h2>
                  <p className="text-sm text-loam-500">
                    {t('teams.members_count', { count: team.membersCount })} · {t('teams.maps_count', { count: team.mapsCount })}
                  </p>
                </div>
                <span className="hidden rounded-full bg-loam-100 px-2 py-0.5 text-xs text-loam-600 sm:inline">{t(`teams.roles.${team.role}`)}</span>
                <ChevronRight className="h-4 w-4 shrink-0 text-loam-400" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      )}

      <CreateTeam />
    </div>
  )
}

function CreateTeam() {
  const form = useForm({ name: '' })
  return (
    <Card>
      <h2 className="flex items-center gap-2 text-base"><Plus className="h-4 w-4 text-leaf-500" aria-hidden="true" />{t('teams.index.create_title')}</h2>
      <form
        className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-start"
        onSubmit={(event) => {
          event.preventDefault()
          form.transform((data) => ({ team: { name: data.name } }))
          form.post('/teams', { preserveScroll: true })
        }}
      >
        <Field label={t('teams.index.name')} hint={t('teams.index.create_hint')} error={form.errors.name} className="flex-1">
          <Input
            value={form.data.name}
            onChange={(event) => form.setData('name', event.target.value)}
            placeholder={t('teams.index.name_placeholder')}
            maxLength={80}
            required
          />
        </Field>
        <Button type="submit" className="sm:mt-6" disabled={form.processing || form.data.name.trim() === ''}>
          {t('teams.index.create')}
        </Button>
      </form>
    </Card>
  )
}
