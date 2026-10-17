# The admin « Tech » view: the version online, where the files are and the
# state of their backup, the background jobs, and which external services are
# configured. Never a secret: a service is only « configured » or not.
module Admin
  class Tech
    REPOSITORY = "https://github.com/semisto-org/designer".freeze
    FAILED_JOBS_SHOWN = 10

    def self.call = new.as_json

    def as_json(*)
      { version:, storage:, jobs:, services: }
    end

    private
      # Coolify passes the deployed commit as SOURCE_COMMIT.
      def version
        commit = ENV["SOURCE_COMMIT"].presence
        { commit:, commitUrl: commit && "#{REPOSITORY}/commit/#{commit}", branch: ENV["COOLIFY_BRANCH"].presence,
          bootedAt: Rails.application.config.x.booted_at&.iso8601, environment: Rails.env,
          ruby: RUBY_VERSION, rails: Rails.version }
      end

      def storage
        services = ActiveStorage::Blob.group(:service_name).pluck(:service_name, Arel.sql("count(*)"), Arel.sql("coalesce(sum(byte_size), 0)"))
          .sort_by { |_, count, _| -count }.map { |name, count, bytes| { name:, files: count, bytes: bytes.to_i } }
        { defaultService: Rails.configuration.active_storage.service.to_s, services:,
          backup: { configured: FileStorage::Backup.configured?, lastRun: FileStorage::Backup.last_run,
                    awaitingErasure: BackupOrphan.where(service_name: "backup").count } }
      end

      # Solid Queue's own tables (production only: tests run jobs inline).
      def jobs
        return { available: false } unless ActiveJob::Base.queue_adapter_name.to_s == "solid_queue"
        { available: true, ready: SolidQueue::ReadyExecution.count, scheduled: SolidQueue::ScheduledExecution.count,
          running: SolidQueue::ClaimedExecution.count, failedCount: SolidQueue::FailedExecution.count,
          failed: failed_jobs, processes: processes, recurring: recurring_tasks }
      rescue ActiveRecord::ActiveRecordError
        { available: false }
      end

      def failed_jobs
        SolidQueue::FailedExecution.includes(:job).order(created_at: :desc).limit(FAILED_JOBS_SHOWN).map do |failed|
          error = failed.error.is_a?(Hash) ? failed.error : {}
          { id: failed.id, job: failed.job&.class_name, failedAt: failed.created_at.iso8601,
            error: [ error["exception_class"], error["message"] ].compact.join(" : ").truncate(300) }
        end
      end

      def processes
        SolidQueue::Process.order(:kind).map { |process| { kind: process.kind, lastHeartbeatAt: process.last_heartbeat_at&.iso8601 } }
      end

      def recurring_tasks
        last_runs = SolidQueue::RecurringExecution.group(:task_key).maximum(:run_at)
        SolidQueue::RecurringTask.order(:key).map do |task|
          { key: task.key, schedule: task.schedule, lastRunAt: last_runs[task.key]&.iso8601 }
        end
      end

      def services
        [
          [ :object_storage, FileStorage.configured?(:object_storage) ],
          [ :backup, FileStorage::Backup.configured? ],
          [ :sentry, ENV["SENTRY_DSN"].present? ],
          [ :smtp, ENV["SMTP_ADDRESS"].present? ],
          [ :google, ENV["GOOGLE_CLIENT_ID"].present? ],
          [ :apple, AppleSignIn.enabled? ],
          [ :stripe, Billing.enabled? ],
          [ :plantnet, Providers::PlantNet.configured? ],
          [ :magnific, Providers::Magnific.configured? ],
          [ :terranova, Providers::Terranova.configured? ]
        ].map { |key, configured| { key:, configured: } }
      end
  end
end
