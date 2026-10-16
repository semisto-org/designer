import { Head, router } from '@inertiajs/react'
import clsx from 'clsx'
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { AdminNav } from '@/components/admin/AdminNav'
import { formatNumber, t } from '@/lib/i18n'
import { formatDate } from '@/lib/money'
import { relativeTime } from '@/lib/relativeTime'
import type { AdminTech } from '@/types/admin'

type Props = { tech: AdminTech }

type Level = 'ok' | 'warn' | 'error' | 'off'

const REFRESH_SECONDS = 30
const MB = 1024 * 1024

function formatSize(bytes: number) {
  return bytes >= 1024 * MB ? `${formatNumber(Math.round((bytes / (1024 * MB)) * 10) / 10)} Go` : `${formatNumber(Math.round(bytes / MB))} Mo`
}

// « 3 j 04:12:09 », the uptime as a console prints it.
function formatUptime(seconds: number) {
  const days = Math.floor(seconds / 86_400)
  const rest = new Date((seconds % 86_400) * 1000).toISOString().slice(11, 19)
  return days > 0 ? `${days} j ${rest}` : rest
}

/** The current time, ticking every second. */
function useNow() {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])
  return now
}

/** Super admin « Tech »: the geek's console of the service, refreshed every 30 seconds. */
export default function AdminTechPage({ tech }: Props) {
  const now = useNow()
  const [refreshedAt, setRefreshedAt] = useState(() => Date.now())
  const left = Math.max(0, REFRESH_SECONDS - Math.floor((now - refreshedAt) / 1000))

  useEffect(() => {
    if (left > 0) return
    router.reload({ only: ['tech'], onFinish: () => setRefreshedAt(Date.now()) })
  }, [left])

  const health = overallHealth(tech)
  return (
    <div>
      <Head title={t('admin.tech.title')} />
      <AdminNav />
      <div className="overflow-hidden rounded-2xl bg-loam-950 font-mono text-sm text-loam-200 shadow-lg ring-1 ring-loam-900">
        <header className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-white/10 bg-loam-900 px-4 py-2.5">
          <span className="flex gap-1.5" aria-hidden>
            <span className="h-3 w-3 rounded-full bg-clay-500" />
            <span className="h-3 w-3 rounded-full bg-humus-400" />
            <span className="h-3 w-3 rounded-full bg-leaf-400" />
          </span>
          <span className="text-loam-400">{t('admin.tech.console.prompt')}</span>
          <span className="ml-auto flex items-center gap-2">
            <Led level={health} />
            <span className={clsx(LEVEL_TEXT[health])}>{t(`admin.tech.console.health.${health}`)}</span>
          </span>
        </header>

        <div className="grid gap-px bg-white/10 sm:grid-cols-3">
          <Metric label={t('admin.tech.console.clock')} value={new Date(now).toLocaleTimeString('fr-BE')} />
          <Metric
            label={t('admin.tech.console.uptime')}
            value={tech.version.bootedAt ? formatUptime(Math.max(0, Math.floor((now - Date.parse(tech.version.bootedAt)) / 1000))) : '—'}
          />
          <Metric label={t('admin.tech.console.refresh')} value={t('admin.tech.console.refresh_in', { seconds: left })} />
        </div>

        <div className="grid gap-px bg-white/10 lg:grid-cols-2">
          <Version version={tech.version} />
          <Storage storage={tech.storage} />
          <Jobs jobs={tech.jobs} now={now} />
          <Services services={tech.services} />
        </div>
      </div>
    </div>
  )
}

const LEVEL_TEXT: Record<Level, string> = {
  ok: 'text-leaf-300',
  warn: 'text-humus-300',
  error: 'text-clay-100',
  off: 'text-loam-500',
}

function overallHealth(tech: AdminTech): Level {
  const backup = tech.storage.backup
  if (tech.jobs.available && tech.jobs.failedCount > 0) return 'error'
  if (backup.lastRun && backup.lastRun.failed > 0) return 'error'
  if (tech.jobs.available && tech.jobs.processes.length === 0) return 'error'
  if (!backup.configured || !tech.version.commit) return 'warn'
  return 'ok'
}

/** A status light; the healthy one breathes. */
function Led({ level }: { level: Level }) {
  return (
    <span className="relative inline-flex h-2.5 w-2.5 shrink-0" aria-hidden>
      {level === 'ok' && <span className="absolute inset-0 animate-ping rounded-full bg-leaf-400 opacity-60" />}
      <span
        className={clsx('relative inline-flex h-2.5 w-2.5 rounded-full', {
          'bg-leaf-400 shadow-[0_0_8px] shadow-leaf-400': level === 'ok',
          'bg-humus-400 shadow-[0_0_8px] shadow-humus-400': level === 'warn',
          'bg-clay-500 shadow-[0_0_8px] shadow-clay-500': level === 'error',
          'bg-loam-600': level === 'off',
        })}
      />
    </span>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-loam-950 px-4 py-3">
      <p className="text-loam-500">{label}</p>
      <p className="mt-0.5 text-2xl tabular-nums text-leaf-300">{value}</p>
    </div>
  )
}

function Panel({ command, children }: { command: string; children: ReactNode }) {
  return (
    <section className="bg-loam-950 p-4">
      <h2 className="font-mono text-sm font-normal text-loam-400">
        <span className="text-prune-300">$</span> {command}
      </h2>
      <div className="mt-3 space-y-2">{children}</div>
    </section>
  )
}

function Row({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
      <span className="text-loam-400">{label}</span>
      <span className="text-right text-loam-100">{children}</span>
    </div>
  )
}

function Version({ version }: { version: AdminTech['version'] }) {
  return (
    <Panel command="git log -1 --oneline">
      {version.commit && version.commitUrl ? (
        <p>
          <a href={version.commitUrl} target="_blank" rel="noreferrer" className="text-humus-300 underline-offset-2 hover:underline">
            {version.commit.slice(0, 7)}
          </a>
          {version.branch && <span className="text-loam-400"> ({version.branch})</span>}
        </p>
      ) : (
        <p className="text-humus-300">{t('admin.tech.version.unknown_commit')}</p>
      )}
      {version.bootedAt && (
        <Row label={t('admin.tech.version.booted_label')}>
          <span title={formatDate(version.bootedAt)}>{relativeTime(version.bootedAt)}</span>
        </Row>
      )}
      <Row label="ruby">{version.ruby}</Row>
      <Row label="rails">{version.rails}</Row>
      <Row label="env">{version.environment}</Row>
    </Panel>
  )
}

function Storage({ storage }: { storage: AdminTech['storage'] }) {
  const { backup } = storage
  const run = backup.lastRun
  const total = storage.services.reduce((sum, service) => sum + service.bytes, 0) || 1
  return (
    <Panel command="storage:status">
      {storage.services.map((service) => (
        <div key={service.name}>
          <Row label={<>{service.name}{service.name === storage.defaultService && <span className="text-prune-300"> *</span>}</>}>
            {t('admin.tech.storage.files', { count: service.files })} · {formatSize(service.bytes)}
          </Row>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-leaf-400" style={{ width: `${Math.max(1, (service.bytes / total) * 100)}%` }} />
          </div>
        </div>
      ))}
      <div className="border-t border-white/10 pt-2">
        <p className="flex items-center gap-2 text-loam-100">
          <Led level={!backup.configured ? 'warn' : !run ? 'off' : run.failed > 0 ? 'error' : 'ok'} />
          {t('admin.tech.storage.backup')}
        </p>
        {!backup.configured ? (
          <p className="mt-1 text-humus-300">{t('admin.tech.storage.backup_off')}</p>
        ) : !run ? (
          <p className="mt-1 text-loam-400">{t('admin.tech.storage.backup_never')}</p>
        ) : (
          <div className="mt-1 space-y-1">
            <Row label={t('admin.tech.storage.backup_last_label')}><span title={formatDate(run.at)}>{relativeTime(run.at)}</span></Row>
            <Row label={t('admin.tech.storage.copied')}>{formatNumber(run.copied)}</Row>
            <Row label={t('admin.tech.storage.already')}>{formatNumber(run.alreadyThere)}</Row>
            <Row label={t('admin.tech.storage.failed')}><span className={clsx(run.failed > 0 && 'text-clay-100')}>{run.failed}</span></Row>
            <Row label={t('admin.tech.storage.missing')}>{run.missing}</Row>
          </div>
        )}
        {backup.configured && (
          <Row label={t('admin.tech.storage.awaiting_erasure')}>{formatNumber(backup.awaitingErasure)}</Row>
        )}
      </div>
    </Panel>
  )
}

function Jobs({ jobs, now }: { jobs: AdminTech['jobs']; now: number }) {
  if (!jobs.available) {
    return (
      <Panel command="solid_queue status">
        <p className="text-loam-400">{t('admin.tech.jobs.unavailable')}</p>
      </Panel>
    )
  }
  return (
    <Panel command="solid_queue status">
      <div className="grid grid-cols-4 gap-2 text-center">
        <Counter label={t('admin.tech.jobs.ready')} value={jobs.ready} />
        <Counter label={t('admin.tech.jobs.scheduled')} value={jobs.scheduled} />
        <Counter label={t('admin.tech.jobs.running')} value={jobs.running} />
        <Counter label={t('admin.tech.jobs.failed_label')} value={jobs.failedCount} alert={jobs.failedCount > 0} />
      </div>
      {jobs.failed.map((failed) => (
        <div key={failed.id} className="rounded-lg bg-clay-800/60 px-3 py-2 text-clay-100">
          <p><span className="text-clay-100">✗ {failed.job}</span> <span className="text-clay-100/70">· {relativeTime(failed.failedAt)}</span></p>
          <p className="break-words text-clay-100/90">{failed.error}</p>
        </div>
      ))}
      <div className="border-t border-white/10 pt-2">
        {jobs.processes.length === 0 ? (
          <p className="flex items-center gap-2 text-clay-100"><Led level="error" /> {t('admin.tech.jobs.no_process')}</p>
        ) : (
          jobs.processes.map((process, index) => {
            const silent = !process.lastHeartbeatAt || now - Date.parse(process.lastHeartbeatAt) > 5 * 60_000
            return (
              <p key={index} className="flex items-center gap-2">
                <Led level={silent ? 'warn' : 'ok'} />
                <span className="text-loam-100">{process.kind}</span>
                <span className="text-loam-500">♥ {relativeTime(process.lastHeartbeatAt)}</span>
              </p>
            )
          })
        )}
      </div>
      <div className="border-t border-white/10 pt-2">
        <p className="text-loam-500">{t('admin.tech.jobs.recurring')}</p>
        <div className="mt-1 space-y-1">
          {jobs.recurring.map((task) => (
            <Row key={task.key} label={task.key}>
              <span className="text-loam-500">{task.schedule}</span>
              {' · '}
              {task.lastRunAt ? relativeTime(task.lastRunAt) : <span className="text-loam-500">{t('admin.tech.jobs.no_recent_run')}</span>}
            </Row>
          ))}
        </div>
      </div>
    </Panel>
  )
}

function Counter({ label, value, alert = false }: { label: string; value: number; alert?: boolean }) {
  return (
    <div className={clsx('rounded-lg px-2 py-2', alert ? 'bg-clay-800/60' : 'bg-white/5')}>
      <p className={clsx('text-2xl tabular-nums', alert ? 'text-clay-100' : 'text-leaf-300')}>{formatNumber(value)}</p>
      <p className="text-loam-500">{label}</p>
    </div>
  )
}

function Services({ services }: { services: AdminTech['services'] }) {
  return (
    <Panel command="systemctl list-units --type=service">
      {services.map((service) => (
        <p key={service.key} className="flex items-baseline gap-3">
          <span className={clsx('w-16 shrink-0', service.configured ? 'text-leaf-300' : 'text-loam-500')}>
            [ {service.configured ? 'OK' : '--'} ]
          </span>
          <span className={clsx(service.configured ? 'text-loam-100' : 'text-loam-500')}>{t(`admin.tech.services.names.${service.key}`)}</span>
        </p>
      ))}
    </Panel>
  )
}
