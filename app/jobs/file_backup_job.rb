# Runs every night in production (config/recurring.yml): copies the files the
# backup bucket does not hold yet and erases those the app deleted 89 days ago
# (FileStorage::Backup). Does nothing until the
# BACKUP_S3_* variables are set. A file it could not copy fails the job, so
# Sentry tells; the others are copied all the same.
class FileBackupJob < ApplicationJob
  queue_as :default

  def perform
    return unless FileStorage::Backup.configured?
    result = FileStorage::Backup.new.run
    Rails.logger.info("[storage:backup] #{result}")
    raise "File backup: #{result}" if result.failed.any?
  end
end
