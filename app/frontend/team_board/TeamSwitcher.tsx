import { Link, useForm } from '@inertiajs/react'
import { Check, ChevronDown, Plus, UsersRound } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Field, Input } from '@/components/ui/Field'
import { t } from '@/lib/i18n'

export type MyTeam = { id: number; name: string }

/**
 * The team's name at the top of its board opens the list of my teams: one
 * click goes to another team's board. Creating a team is rare, so it waits
 * at the bottom of that list instead of taking room on the page.
 */
export function TeamSwitcher({ current, teams }: { current: MyTeam; teams: MyTeam[] }) {
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === 'Escape' : !ref.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', close)
    }
  }, [open])

  const item = 'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-loam-700 hover:bg-prune-50 hover:text-prune-800'

  return (
    <div ref={ref} className="relative min-w-0 flex-1">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="-ml-3 max-w-full"
      >
        <UsersRound className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="truncate">{current.name}</span>
        <ChevronDown className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="sr-only">{t('team_board.switcher.open')}</span>
      </Button>

      {open && (
        <div role="menu" className="absolute left-0 top-full z-50 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-2xl bg-white p-2 shadow-lg ring-1 ring-loam-200">
          {teams.length > 1 && <p className="px-3 pb-1 pt-1 font-hand text-lg text-leaf-600">{t('team_board.switcher.title')}</p>}
          {teams.map((team) => (
            <Link key={team.id} href={`/teams/${team.id}/board`} role="menuitem" className={item} onClick={() => setOpen(false)}>
              <span className="min-w-0 flex-1 truncate">{team.name}</span>
              {team.id === current.id && <Check className="h-4 w-4 shrink-0 text-leaf-600" aria-label={t('team_board.switcher.current')} />}
            </Link>
          ))}
          <div className="mt-1 border-t border-dashed border-loam-200 pt-1">
            <Button
              variant="ghost"
              role="menuitem"
              onClick={() => { setOpen(false); setCreating(true) }}
              size="sm"
              className="w-full justify-start! gap-3! rounded-lg px-3! py-2! font-normal! text-loam-600"
            >
              <Plus className="h-4 w-4 text-loam-400" aria-hidden="true" />
              {t('team_board.switcher.create')}
            </Button>
          </div>
        </div>
      )}

      <CreateTeamDialog open={creating} onClose={() => setCreating(false)} />
    </div>
  )
}

function CreateTeamDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const form = useForm({ name: '' })
  const close = () => { form.reset(); form.clearErrors(); onClose() }
  return (
    <Dialog open={open} onClose={close} title={t('teams.index.create_title')} dismissOnBackdrop={false}>
      <form
        id="create-team"
        onSubmit={(event) => {
          event.preventDefault()
          form.transform((data) => ({ team: { name: data.name } }))
          form.post('/teams', { onSuccess: close })
        }}
      >
        <Field label={t('teams.index.name')} hint={t('teams.index.create_hint')} error={form.errors.name}>
          <Input
            value={form.data.name}
            onChange={(event) => form.setData('name', event.target.value)}
            placeholder={t('teams.index.name_placeholder')}
            maxLength={80}
            required
            autoFocus
          />
        </Field>
      </form>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={close}>{t('common.cancel')}</Button>
        <Button type="submit" form="create-team" disabled={form.processing || form.data.name.trim() === ''}>{t('teams.index.create')}</Button>
      </div>
    </Dialog>
  )
}
