import { Head } from '@inertiajs/react'
import clsx from 'clsx'
import { AlertTriangle, CheckCircle2, Cog, GitCommit, HardDrive, Plug } from 'lucide-react'
import type { ReactNode } from 'react'
import { AdminNav } from '@/components/admin/AdminNav'
import { Card } from '@/components/ui/Card'
import { formatNumber, t } from '@/lib/i18n'
import { formatDate } from '@/lib/money'
import { relativeTime } from '@/lib/relativeTime'
import type { AdminTech } from '@/types/admin'

type Props = { tech: AdminTech }

const MB = 1024 * 1024

function formatSize(bytes: number) {
  return bytes >= 1024 * MB ? `${formatNumber(Math.round((bytes / (1024 * MB)) * 10) / 10)} Go` : `${formatNumber(Math.round(bytes / MB))} Mo`
}

/** Super admin « Tech »: the geek's view of the service. */
export default function AdminTechPage({ tech }: Props) {
  return (
    <div>
      <Head title={t('admin.tech.title')} />
      <AdminNav />
      <h1 className="text-2xl">{t('admin.tech.title')}</h1>
      <p className="mt-1 text-loam-500">{t('admin.tech.intro')}</p>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Version version={tech.version} />
        <Storage storage={tech.storage} />
        <Jobs jobs={tech.jobs} />
        <Services services={tech.services} />
      </div>
    </div>
  )
}

function Section({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <Card>
      <h2 className="flex items-center gap-2 font-sans text-sm font-medium text-loam-500">
        <span className="text-prune-500" aria-hidden>{icon}</span>{title}
      </h2>
      <div className="mt-3 space-y-2 text-sm text-loam-700">{children}</div>
    </Card>
  )
}

function Version({ version }: { version: AdminTech['version'] }) {
  return (
    <Section icon={<GitCommit className="h-4 w-4" />} title={t('admin.tech.version.title')}>
      {version.commit && version.commitUrl ? (
        <p>
          <a href={version.commitUrl} target="_blank" rel="noreferrer" className="font-mono text-prune-700 underline-offset-2 hover:underline">
            {t('admin.tech.version.commit', { commit: version.commit.slice(0, 7) })}
          </a>
          {version.branch && <span className="text-loam-500"> · {t('admin.tech.version.branch', { branch: version.branch })}</span>}
        </p>
      ) : (
        <p className="text-loam-500">{t('admin.tech.version.unknown_commit')}</p>
      )}
      {version.bootedAt && (
        <p title={formatDate(version.bootedAt)}>{t('admin.tech.version.booted', { when: relativeTime(version.bootedAt) })}</p>
      )}
      <p className="text-loam-500">{t('admin.tech.version.stack', { ruby: version.ruby, rails: version.rails, environment: version.environment })}</p>
    </Section>
  )
}

function Storage({ storage }: { storage: AdminTech['storage'] }) {
  const { backup } = storage
  const run = backup.lastRun
  return (
    <Section icon={<HardDrive className="h-4 w-4" />} title={t('admin.tech.storage.title')}>
      <ul className="space-y-1">
        {storage.services.map((service) => (
          <li key={service.name} className="flex flex-wrap items-baseline justify-between gap-x-3">
            <span className="font-mono">
              {service.name}
              {service.name === storage.defaultService && <span className="ml-2 font-sans text-loam-500">({t('admin.tech.storage.default')})</span>}
            </span>
            <span>{t('admin.tech.storage.files', { count: service.files })} · {formatSize(service.bytes)}</span>
          </li>
        ))}
      </ul>
      <div className="border-t border-loam-100 pt-2">
        <p className="font-medium text-loam-800">{t('admin.tech.storage.backup')}</p>
        {!backup.configured ? (
          <p className="text-clay-700">{t('admin.tech.storage.backup_off')}</p>
        ) : !run ? (
          <p className="text-loam-500">{t('admin.tech.storage.backup_never')}</p>
        ) : (
          <>
            <p className={clsx(run.failed > 0 && 'text-clay-700')} title={formatDate(run.at)}>
              <StatusIcon ok={run.failed === 0} /> {t('admin.tech.storage.backup_last', { when: relativeTime(run.at) })}
            </p>
            <p className="text-loam-600">
              {t('admin.tech.storage.backup_figures', {
                copied: formatNumber(run.copied), already: formatNumber(run.alreadyThere), failed: run.failed, missing: run.missing,
              })}
            </p>
          </>
        )}
        {backup.configured && (
          <p className="text-loam-600">
            {t('admin.tech.storage.backup_erasure', { waiting: formatNumber(backup.awaitingErasure), erased: run?.erased ?? 0 })}
          </p>
        )}
      </div>
    </Section>
  )
}

function Jobs({ jobs }: { jobs: AdminTech['jobs'] }) {
  if (!jobs.available) {
    return (
      <Section icon={<Cog className="h-4 w-4" />} title={t('admin.tech.jobs.title')}>
        <p className="text-loam-500">{t('admin.tech.jobs.unavailable')}</p>
      </Section>
    )
  }
  return (
    <Section icon={<Cog className="h-4 w-4" />} title={t('admin.tech.jobs.title')}>
      <p>{t('admin.tech.jobs.queue', { ready: jobs.ready, scheduled: jobs.scheduled, running: jobs.running })}</p>
      <p className={clsx('font-medium', jobs.failedCount > 0 ? 'text-clay-700' : 'text-leaf-700')}>
        <StatusIcon ok={jobs.failedCount === 0} /> {t('admin.tech.jobs.failed', { count: jobs.failedCount })}
      </p>
      {jobs.failed.length > 0 && (
        <ul className="space-y-1.5">
          {jobs.failed.map((failed) => (
            <li key={failed.id} className="rounded-xl bg-clay-50 px-3 py-2">
              <span className="font-mono text-loam-800">{failed.job}</span>
              <span className="text-loam-500"> · {relativeTime(failed.failedAt)}</span>
              <p className="break-words text-loam-700">{failed.error}</p>
            </li>
          ))}
        </ul>
      )}
      <div className="border-t border-loam-100 pt-2">
        <p className="font-medium text-loam-800">{t('admin.tech.jobs.processes')}</p>
        {jobs.processes.length === 0 ? (
          <p className="text-clay-700">{t('admin.tech.jobs.no_process')}</p>
        ) : (
          <ul>
            {jobs.processes.map((process, index) => (
              <li key={index}>{t('admin.tech.jobs.heartbeat', { kind: process.kind, when: relativeTime(process.lastHeartbeatAt) })}</li>
            ))}
          </ul>
        )}
      </div>
      <div className="border-t border-loam-100 pt-2">
        <p className="font-medium text-loam-800">{t('admin.tech.jobs.recurring')}</p>
        <ul className="space-y-1">
          {jobs.recurring.map((task) => (
            <li key={task.key} className="flex flex-wrap items-baseline justify-between gap-x-3">
              <span className="font-mono">{task.key}</span>
              <span className="text-loam-500">
                {task.schedule} · {task.lastRunAt ? t('admin.tech.jobs.last_run', { when: relativeTime(task.lastRunAt) }) : t('admin.tech.jobs.no_recent_run')}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </Section>
  )
}

function Services({ services }: { services: AdminTech['services'] }) {
  return (
    <Section icon={<Plug className="h-4 w-4" />} title={t('admin.tech.services.title')}>
      <ul className="space-y-1">
        {services.map((service) => (
          <li key={service.key} className="flex items-center justify-between gap-3">
            <span>{t(`admin.tech.services.names.${service.key}`)}</span>
            <span className={clsx('flex items-center gap-1', service.configured ? 'text-leaf-700' : 'text-loam-500')}>
              <StatusIcon ok={service.configured} />
              {service.configured ? t('admin.tech.services.configured') : t('admin.tech.services.missing')}
            </span>
          </li>
        ))}
      </ul>
    </Section>
  )
}

function StatusIcon({ ok }: { ok: boolean }) {
  return ok
    ? <CheckCircle2 className="inline h-4 w-4 align-[-3px]" aria-hidden />
    : <AlertTriangle className="inline h-4 w-4 align-[-3px]" aria-hidden />
}
