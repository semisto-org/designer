# Runs every night in production (config/recurring.yml): copies the files the
# backup bucket does not hold yet and erases those the app deleted 89 days ago
# (FileStorage::Backup). Does nothing until the
# BACKUP_S3_* variables are set. A file it could not copy fails the job, so
# Sentry tells; the others are copied all the same.
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

  def perform
    return unless FileStorage::Backup.configured?
    check_in_id = check_in(:in_progress)
    result = FileStorage::Backup.new.run
    Rails.logger.info("[storage:backup] #{result}")
    FileStorage::Backup.record(result)
    raise "File backup: #{result}" if result.failed.any?
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
