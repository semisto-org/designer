import { Sparkles } from 'lucide-react'
import { Pill } from '@/components/ui/Pill'
import { t } from '@/lib/i18n'
import type { CommentData } from '@/types/collab'

/** « IA · à la demande de Michael »: next to the name on every message of the team's colleague. */
export function AgentByline({ agent }: { agent: NonNullable<CommentData['agent']> }) {
  return (
    <>
      <Pill tone="leaf" className="!px-1.5 !py-0">{t('agents.badge')}</Pill>
      <span>{t('agents.chat.requested_by', { name: agent.requestedBy })}</span>
    </>
  )
}

/** Under the message that asked her something: « Léa y travaille… » until she answers. */
export function AgentWorking({ run }: { run: CommentData['agentRun'] }) {
  if (!run || (run.status !== 'queued' && run.status !== 'running')) return null
  return (
    <p role="status" className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-leaf-50 px-2.5 py-0.5 text-sm text-leaf-800">
      <Sparkles className="h-3.5 w-3.5 animate-pulse" aria-hidden />
      {t('agents.chat.working', { name: run.name })}
    </p>
  )
}
