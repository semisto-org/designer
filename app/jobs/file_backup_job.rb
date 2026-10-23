# Runs every night in production (config/recurring.yml): copies the files the
# backup bucket does not hold yet and erases those the app deleted 89 days ago
# (FileStorage::Backup). Does nothing until the
# BACKUP_S3_* variables are set. A file it could not copy fails the job, so
# Sentry tells; the others are copied all the same.
#
# A night when a bucket refuses requests for a while (the main bucket
# answered 403 to every file on 23 October 2026, and served them again by
# day) is not worth an alert: a run with failed files tries again RETRY_WAIT
# later, RETRIES times, before failing. The retries copy only what is still
# missing, and close the same Sentry check-in.
#
# Each run also checks in with the Sentry Crons monitor `file-backup`, which
# alerts when a day goes by without a finished backup: a run cut by a deploy,
# a stopped worker, or BACKUP_S3_* gone (that run skips without checking in).
class FileBackupJob < ApplicationJob
  queue_as :default

  MONITOR = "file-backup"
  # An interval, not a crontab, so the monitor does not depend on the
  # container's time zone; the first copy can run for hours.
  MONITOR_CONFIG = Sentry::Cron::MonitorConfig.from_interval(1, :day, checkin_margin: 120, max_runtime: 360)
  RETRIES = 2
  RETRY_WAIT = 1.hour

  def perform(attempt: 1, check_in_id: nil)
    return unless FileStorage::Backup.configured?
    check_in_id ||= check_in(:in_progress)
    result = FileStorage::Backup.new.run
    Rails.logger.info("[storage:backup] #{result}")
    FileStorage::Backup.record(result)
    if result.failed.any?
      if attempt <= RETRIES
        Rails.logger.warn("[storage:backup] trying again in #{RETRY_WAIT.inspect} (attempt #{attempt + 1})")
        return self.class.set(wait: RETRY_WAIT).perform_later(attempt: attempt + 1, check_in_id:)
      end
      raise "File backup: #{result}"
    end
    check_in(:ok, check_in_id:)
  rescue Exception
    check_in(:error, check_in_id:) if check_in_id
    raise
  end

  private
    def check_in(status, **options)
      Sentry.capture_check_in(MONITOR, status, monitor_config: MONITOR_CONFIG, **options)
    end
end
