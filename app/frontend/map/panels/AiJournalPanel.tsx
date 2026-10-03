import { Link } from '@inertiajs/react'
import { AlertTriangle, Bot, Check, Eye, Layers, MapPin, Sparkles, Undo2, X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { api } from '@/lib/api'
import { t } from '@/lib/i18n'
import { useEditor } from '@/map/editor/EditorContext'
import type { AiActionData } from '@/types/mcp'

type Page = { actions: AiActionData[]; nextBeforeId: number | null }

const ICONS: Record<string, typeof Bot> = {
  propose_features: Sparkles,
  withdraw_draft: Undo2,
  list_features: Layers,
  get_region_layers: Layers,
  identify_at_point: MapPin,
}

const relative = new Intl.RelativeTimeFormat('fr', { numeric: 'auto' })

export function timeAgo(iso: string): string {
  const seconds = (new Date(iso).getTime() - Date.now()) / 1000
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [['day', 86400], ['hour', 3600], ['minute', 60]]
  for (const [unit, size] of steps) {
    if (Math.abs(seconds) >= size) return relative.format(Math.round(seconds / size), unit)
  }
  return relative.format(0, 'second')
}

/** What a journal entry says the AI did, in a sentence. */
function describe(action: AiActionData): string {
  const n = (key: string) => Number(action.result[key] ?? 0)
  switch (action.tool) {
    case 'list_features': return t('ai_journal.actions.list_features', { count: n('features') })
    case 'propose_features': return t('ai_journal.actions.propose_features', { count: n('created') })
    case 'withdraw_draft': return t('ai_journal.actions.withdraw_draft', { count: n('withdrawn') })
    default: return t(`ai_journal.actions.${action.tool}`)
  }
}

/** « Journal IA »: every MCP call made on this map, for its owner. */
export default function AiJournalPanel() {
  const editor = useEditor()
  const [actions, setActions] = useState<AiActionData[]>([])
  const [next, setNext] = useState<number | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')

  const load = useCallback(async (before?: number) => {
    try {
      const page = await api<Page>(`/maps/${editor.map.id}/ai_actions${before ? `?before_id=${before}` : ''}`)
      setActions((current) => (before ? [...current, ...page.actions] : page.actions))
      setNext(page.nextBeforeId)
      setState('ready')
    } catch {
      setState('error')
    }
  }, [editor.map.id])

  useEffect(() => { void load() }, [load])

  return (
    <div className="space-y-4">
      <p className="text-sm text-loam-600">{t('ai_journal.intro')}</p>
      {state === 'loading' && <p className="text-sm text-loam-500">{t('common.loading')}</p>}
      {state === 'error' && <p className="text-sm text-clay-500">{t('ai_journal.error')}</p>}
      {state === 'ready' && actions.length === 0 && (
        <div className="rounded-lg border border-dashed border-loam-300 p-4 text-sm text-loam-500">
          <p>{t('ai_journal.empty')}</p>
        </div>
      )}
      {actions.length > 0 && (
        <ol className="space-y-3">
          {actions.map((action) => {
            const Icon = action.status === 'error' ? AlertTriangle : ICONS[action.tool] ?? Eye
            const summary = typeof action.arguments.summary === 'string' ? action.arguments.summary : null
            return (
              <li key={action.id} className="flex gap-2.5">
                <span className={'mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full ' + (action.status === 'error' ? 'bg-clay-50 text-clay-500' : 'bg-prune-50 text-prune-600')}>
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0 flex-1 text-sm">
                  <p className="text-loam-800">
                    <span className="font-medium">{action.clientName || t('drafts.default_author')}</span>{' '}
                    {action.status === 'error'
                      ? t('ai_journal.refused', { tool: t(`mcp.tools.${action.tool}.title`) })
                      : describe(action)}
                  </p>
                  {action.status === 'error' && action.errorMessage && action.errorMessage !== 'internal_error' && (
                    <p className="mt-0.5 text-xs text-clay-500">{action.errorMessage}</p>
                  )}
                  {summary && <p className="mt-1 line-clamp-3 border-l-2 border-humus-200 pl-2 text-xs text-loam-600">{summary}</p>}
                  {action.outcome && <Outcome outcome={action.outcome} />}
                  <p className="mt-0.5 text-xs text-loam-400">
                    {t('ai_journal.by', { name: action.userName })} · {timeAgo(action.createdAt)}
                  </p>
                </div>
              </li>
            )
          })}
        </ol>
      )}
      {next && (
        <Button variant="secondary" size="sm" className="w-full" onClick={() => load(next)}>
          {t('ai_journal.more')}
        </Button>
      )}
      <div className="border-t border-loam-100 pt-3 text-xs text-loam-500">
        <Link href="/account/ai" className="inline-flex items-center gap-1 font-medium text-prune-600 hover:text-prune-800">
          <Bot className="h-3.5 w-3.5" />
          {t('ai_journal.connect')}
        </Link>
        <span className="mx-1.5">·</span>
        <a href="/docs/mcp" className="hover:text-loam-800">{t('ai_journal.docs')}</a>
      </div>
    </div>
  )
}

function Outcome({ outcome }: { outcome: NonNullable<AiActionData['outcome']> }) {
  const items: [keyof typeof outcome, typeof Check, string][] = [
    ['active', Check, 'text-leaf-600'],
    ['rejected', X, 'text-clay-500'],
    ['draft', Sparkles, 'text-humus-600'],
    ['withdrawn', Undo2, 'text-loam-400'],
  ]
  return (
    <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
      {items.filter(([key]) => (outcome[key] ?? 0) > 0).map(([key, Icon, color]) => (
        <span key={key} className={'inline-flex items-center gap-1 ' + color}>
          <Icon className="h-3 w-3" />
          {t(`ai_journal.outcome.${key}`, { count: outcome[key] ?? 0 })}
        </span>
      ))}
    </p>
  )
}
