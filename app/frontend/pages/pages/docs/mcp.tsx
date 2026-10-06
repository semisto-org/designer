import { Head, Link } from '@inertiajs/react'
import { Bot, Check, KeyRound, ShieldCheck, Sparkles } from 'lucide-react'
import clsx from 'clsx'
import type { ReactNode } from 'react'
import { CopyField } from '@/components/CopyField'
import { formatNumber, t } from '@/lib/i18n'
import type { McpEndpoints, McpToolDoc, McpToolParameter } from '@/types/mcp'

type Props = {
  tools: McpToolDoc[]
  endpoints: McpEndpoints
  scopes: string[]
  limits: {
    requestsPerMinute: number
    maxFeaturesPerProposal: number
    maxPendingDrafts: number
    bufferM: number
    accessTokenMinutes: number
    refreshTokenDays: number
  }
}

/**
 * Public reference of the MCP server. Tool names, descriptions and
 * parameters come from the server's own tool definitions (Mcp::Docs).
 */
export default function McpDocs({ tools, endpoints, scopes, limits }: Props) {
  const example = JSON.stringify({
    jsonrpc: '2.0', id: 1, method: 'tools/call',
    params: { name: 'get_map', arguments: { map_id: 42 } },
  })
  const curl = [
    `curl ${endpoints.mcp} \\`,
    `  -H "Authorization: Bearer sdp_…" \\`,
    `  -H "Content-Type: application/json" \\`,
    `  -H "Accept: application/json, text/event-stream" \\`,
    `  -d '${example}'`,
  ].join('\n')

  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <Head title={t('docs_mcp.page_title')} />
      <p className="text-sm font-semibold uppercase tracking-wide text-prune-600">{t('docs_mcp.eyebrow')}</p>
      <h1 className="mt-2 text-3xl leading-tight sm:text-4xl">{t('docs_mcp.title')}</h1>
      <p className="mt-4 max-w-2xl text-lg text-loam-600">{t('docs_mcp.intro')}</p>

      <nav aria-label={t('docs_mcp.toc')} className="mt-8 flex flex-wrap gap-2 text-sm">
        {(['connect', 'auth', 'guardrails', 'tools', 'limits'] as const).map((id) => (
          <a key={id} href={`#${id}`} className="rounded-full bg-white px-3 py-1 text-loam-700 ring-1 ring-loam-200 hover:ring-prune-300">
            {t(`docs_mcp.sections.${id}`)}
          </a>
        ))}
      </nav>

      <Section id="connect" icon={Bot}>
        <p className="text-loam-700">{t('docs_mcp.connect.url')}</p>
        <CopyField value={endpoints.mcp} className="mt-2 max-w-xl" />
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <Step title={t('docs_mcp.connect.claude_ai_title')}>{t('docs_mcp.connect.claude_ai')}</Step>
          <Step title={t('docs_mcp.connect.chatgpt_title')}>{t('docs_mcp.connect.chatgpt')}</Step>
          <Step title={t('docs_mcp.connect.le_chat_title')}>{t('docs_mcp.connect.le_chat')}</Step>
          <Step title={t('docs_mcp.connect.claude_code_title')}>
            {t('docs_mcp.connect.claude_code')}
            <code tabIndex={0} className="mt-2 block overflow-x-auto whitespace-nowrap rounded bg-loam-900 px-2 py-1.5 font-mono text-xs text-loam-50">
              claude mcp add --transport http semisto-designer {endpoints.mcp}
            </code>
          </Step>
          <Step title={t('docs_mcp.connect.other_title')}>{t('docs_mcp.connect.other')}</Step>
        </div>
        <p className="mt-4 text-sm text-loam-600">
          {t('docs_mcp.connect.account')}{' '}
          <Link href="/account/ai" className="font-medium text-prune-600 hover:text-prune-800">{t('docs_mcp.connect.account_link')}</Link>
        </p>
      </Section>

      <Section id="auth" icon={KeyRound}>
        <p className="text-loam-700">{t('docs_mcp.auth.intro', { minutes: limits.accessTokenMinutes, days: limits.refreshTokenDays })}</p>
        <dl className="mt-4 divide-y divide-loam-100 overflow-hidden rounded-xl bg-white text-sm ring-1 ring-loam-200/70">
          {([
            ['protectedResourceMetadata', endpoints.protectedResourceMetadata],
            ['authorizationServerMetadata', endpoints.authorizationServerMetadata],
            ['register', endpoints.register],
            ['authorize', endpoints.authorize],
            ['token', endpoints.token],
            ['revoke', endpoints.revoke],
          ] as const).map(([key, url]) => (
            <div key={key} className="grid gap-1 px-4 py-2.5 sm:grid-cols-[14rem_1fr]">
              <dt className="text-loam-600">{t(`docs_mcp.auth.endpoints.${key}`)}</dt>
              <dd className="min-w-0 break-all font-mono text-xs text-loam-800 sm:text-sm">{url}</dd>
            </div>
          ))}
        </dl>
        <h3 className="mt-6 text-base">{t('docs_mcp.auth.scopes_title')}</h3>
        <ul className="mt-2 space-y-2 text-sm">
          {scopes.map((scope) => (
            <li key={scope} className="flex flex-col gap-1 sm:flex-row sm:gap-3">
              <code className="w-32 shrink-0 font-mono text-prune-700">{scope}</code>
              <span className="text-loam-700">{t(`docs_mcp.auth.scopes.${scope.replace('maps:', '')}`)}</span>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-sm text-loam-600">{t('docs_mcp.auth.tokens')}</p>
        <pre tabIndex={0} className="mt-3 overflow-x-auto rounded-xl bg-loam-900 p-4 font-mono text-xs leading-relaxed text-loam-50">{curl}</pre>
      </Section>

      <Section id="guardrails" icon={ShieldCheck}>
        <ul className="space-y-2 text-loam-700">
          {(['never', 'rationale', 'networks', 'roles', 'journal', 'revoke'] as const).map((key) => (
            <li key={key} className="flex gap-2"><Check className="mt-1 h-4 w-4 shrink-0 text-leaf-600" />{t(`docs_mcp.guardrails.${key}`)}</li>
          ))}
        </ul>
      </Section>

      <Section id="tools" icon={Sparkles}>
        <ul className="mb-6 flex flex-wrap gap-2">
          {tools.map((tool) => (
            <li key={tool.name}>
              <a href={`#tool-${tool.name}`} className="rounded bg-loam-100 px-2 py-0.5 font-mono text-xs text-loam-700 hover:bg-prune-50 hover:text-prune-700">{tool.name}</a>
            </li>
          ))}
        </ul>
        <div className="space-y-6">
          {tools.map((tool) => <ToolCard key={tool.name} tool={tool} />)}
        </div>
      </Section>

      <Section id="limits" icon={Bot}>
        <ul className="space-y-1.5 text-loam-700">
          <li>{t('docs_mcp.limits.rate', { count: limits.requestsPerMinute })}</li>
          <li>{t('docs_mcp.limits.proposal', { count: limits.maxFeaturesPerProposal })}</li>
          <li>{t('docs_mcp.limits.pending', { count: formatNumber(limits.maxPendingDrafts) })}</li>
          <li>{t('docs_mcp.limits.buffer', { meters: limits.bufferM })}</li>
          <li>{t('docs_mcp.limits.transport')}</li>
        </ul>
      </Section>
    </div>
  )
}

function Section({ id, icon: Icon, children }: { id: string; icon: typeof Bot; children: ReactNode }) {
  return (
    <section id={id} className="mt-14 scroll-mt-20">
      <h2 className="flex items-center gap-2 text-2xl">
        <Icon className="h-5 w-5 text-prune-500" />
        {t(`docs_mcp.sections.${id}`)}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  )
}

function Step({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-w-0 rounded-xl bg-white p-4 text-sm text-loam-700 ring-1 ring-loam-200/70">
      <h3 className="mb-1.5 text-sm font-semibold text-loam-900">{title}</h3>
      {children}
    </div>
  )
}

function ToolCard({ tool }: { tool: McpToolDoc }) {
  return (
    <article id={`tool-${tool.name}`} className="scroll-mt-20 rounded-xl bg-white p-5 ring-1 ring-loam-200/70">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-mono text-base text-loam-900">{tool.name}</h3>
        <span className={clsx('rounded-full px-2 py-0.5 text-xs', tool.readOnly ? 'bg-loam-100 text-loam-600' : 'bg-humus-100 text-humus-700')}>
          {t(tool.readOnly ? 'docs_mcp.tool.read_only' : 'docs_mcp.tool.writes_drafts')}
        </span>
      </div>
      <p className="mt-1 text-sm font-medium text-loam-800">{tool.title}</p>
      <p className="mt-2 text-sm text-loam-600">{tool.description}</p>
      <p className="mt-2 text-xs text-loam-500">{t(`docs_mcp.requirements.${tool.requirement}`)}</p>
      {tool.parameters.length === 0 ? (
        <p className="mt-3 text-xs italic text-loam-500">{t('docs_mcp.tool.no_parameters')}</p>
      ) : (
        <div className="mt-3 text-sm">
          <div className="hidden grid-cols-[13rem_7.5rem_1fr] gap-3 py-1.5 text-xs uppercase tracking-wide text-loam-500 sm:grid" aria-hidden="true">
            <span className="font-medium">{t('docs_mcp.tool.parameter')}</span>
            <span className="font-medium">{t('docs_mcp.tool.type')}</span>
            <span className="font-medium">{t('docs_mcp.tool.description')}</span>
          </div>
          <dl className="divide-y divide-loam-100 border-t border-loam-100 sm:border-t-0">
            {tool.parameters.map((param) => (
              <div key={param.name} className="grid gap-x-3 gap-y-1 py-2 sm:grid-cols-[13rem_7.5rem_1fr]">
                <dt className="flex min-w-0 flex-wrap items-baseline gap-x-1.5">
                  <code className="break-all font-mono text-xs text-prune-700">{param.name}</code>
                  {param.required && <span className="text-xs text-clay-500">{t('docs_mcp.tool.required')}</span>}
                  <span className="font-mono text-xs text-loam-500 sm:hidden">· {param.type}</span>
                </dt>
                <dd className="hidden font-mono text-xs text-loam-600 sm:block">{param.type}</dd>
                <dd className="min-w-0 text-loam-700">
                  {param.description}
                  <ParameterDetails param={param} />
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </article>
  )
}

function ParameterDetails({ param }: { param: McpToolParameter }) {
  const details: string[] = []
  const c = param.constraints ?? {}
  if (c.minimum !== undefined && c.maximum !== undefined) details.push(t('docs_mcp.constraints.range', { min: c.minimum, max: c.maximum }))
  else if (c.minimum !== undefined) details.push(t('docs_mcp.constraints.min', { min: c.minimum }))
  if (c.minLength !== undefined && c.maxLength !== undefined) details.push(t('docs_mcp.constraints.length', { min: c.minLength, max: c.maxLength }))
  else if (c.maxLength !== undefined) details.push(t('docs_mcp.constraints.max_length', { max: c.maxLength }))
  if (c.minItems !== undefined && c.maxItems !== undefined) details.push(t('docs_mcp.constraints.items', { min: c.minItems, max: c.maxItems }))
  else if (c.maxItems !== undefined) details.push(t('docs_mcp.constraints.max_items', { max: c.maxItems }))
  if (c.maxProperties !== undefined) details.push(t('docs_mcp.constraints.max_properties', { max: c.maxProperties }))
  if (param.default !== undefined) details.push(t('docs_mcp.constraints.default', { value: String(param.default) }))
  if (details.length === 0 && !param.enum) return null
  return (
    <span className="mt-1 block text-xs text-loam-500">
      {details.join(' · ')}
      {param.enum && (
        <span className="mt-1 flex flex-wrap gap-1">
          {param.enum.map((value) => <code key={value} className="rounded bg-loam-100 px-1 font-mono">{value}</code>)}
        </span>
      )}
    </span>
  )
}
