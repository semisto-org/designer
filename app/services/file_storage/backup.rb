# The nightly copy of every uploaded file to the backup bucket (`backup` in
# config/storage.yml, FileBackupJob). Only the files the backup does not hold
# yet are sent, and nothing is ever overwritten there.
#
# A file the app deleted stays in the backup for RETENTION, so a database
# backup of that period can still be restored with its files, then it is
# erased: the privacy policy promises that deleted data leaves the backups
# within 90 days. The clock starts the first night the file is seen without a
# blob (BackupOrphan), one day at most after the deletion.
module FileStorage
  class Backup
    RETENTION = 89.days

    # Beyond this share of the backup without a blob (and more than a handful
    # of files), the database looks wrong (an empty or old restore): nothing is
    # marked for erasure and the run fails.
    MAX_ORPHAN_SHARE = 0.25
    ORPHAN_ALARM_FLOOR = 100

    # `reasons` counts the failures by error, so the report names the cause
    # (a source refusing every request reads differently from one bad file).
    Result = Struct.new(:copied, :already_there, :missing, :failed, :erased, :awaiting_erasure, :reasons, keyword_init: true) do
      def to_s
        "#{copied} copied, #{already_there} already there, #{missing.size} missing at the source, #{failed.size} failed, " \
          "#{erased} erased after #{RETENTION.in_days.round} days, #{awaiting_erasure} deleted from the app and kept for now" \
          "#{"; failures: #{failure_reasons}" if failed.any? && reasons.present?}"
      end

      def record_failure(id, error)
        failed << id
        (self.reasons ||= Hash.new(0))[[ error.class.name, error.message.presence ].compact.join(": ").first(200)] += 1
      end

      private

      def failure_reasons = reasons.sort_by { -_2 }.first(3).map { |reason, count| "#{count} × #{reason}" }.join(", ")
    end

    def self.configured?(target = :backup) = FileStorage.configured?(target)

    LAST_RUN_KEY = "file_backup/last_run"

    # The figures of the latest run, for the admin « Tech » view.
    def self.record(result, at: Time.current)
      Rails.cache.write(LAST_RUN_KEY, { at: at.iso8601, copied: result.copied, alreadyThere: result.already_there,
        missing: result.missing.size, failed: result.failed.size, erased: result.erased, awaitingErasure: result.awaiting_erasure })
    rescue StandardError => error
      Rails.logger.warn("[storage:backup] could not record the run: #{error.message}")
    end

    def self.last_run = Rails.cache.read(LAST_RUN_KEY)

    # `service` replaces the one named `target`, `alarm_floor` the floor (tests).
    def initialize(target: :backup, service: nil, alarm_floor: ORPHAN_ALARM_FLOOR, logger: Rails.logger)
      @target = target.to_s
      @service = service
      @alarm_floor = alarm_floor
      @logger = logger
    end

    def run(now: Time.current)
      target = @service || FileStorage.service(@target)
      keys = FileStorage.keys_of(target)
      result = Result.new(copied: 0, already_there: 0, missing: [], failed: [], erased: 0, awaiting_erasure: 0, reasons: Hash.new(0))

      ActiveStorage::Blob.where.not(service_name: @target).find_each do |blob|
        if FileStorage.holds?(target, keys, blob.key)
          result.already_there += 1
        elsif !blob.service.exist?(blob.key)
          result.missing << blob.id
        else
          FileStorage.copy(blob, target)
          result.copied += 1
        end
      rescue StandardError => e
        result.record_failure(blob.id, e)
        @logger.error("[storage:backup] blob #{blob.id}: #{e.class}: #{e.message}")
      end

      purge_orphans(target, keys, result, now) if keys
      result
    end

    private

    def purge_orphans(target, keys, result, now)
      orphans = keys - ActiveStorage::Blob.pluck(:key)
      if orphans.size > @alarm_floor && orphans.size > keys.size * MAX_ORPHAN_SHARE
        raise "#{orphans.size} of #{keys.size} backup files have no blob: is this the right database? Nothing erased."
      end

      known = BackupOrphan.where(service_name: @target)
      known.where.not(key: orphans.to_a).delete_all
      fresh = orphans - known.pluck(:key)
      BackupOrphan.insert_all(fresh.map { |key| { service_name: @target, key:, first_seen_at: now } }) if fresh.any?

      known.where(first_seen_at: ..(now - RETENTION)).find_each do |orphan|
        target.delete(orphan.key)
        orphan.delete
        result.erased += 1
      rescue StandardError => e
        result.record_failure(orphan.key, e)
        @logger.error("[storage:backup] erasing #{orphan.key}: #{e.class}: #{e.message}")
      end
      result.awaiting_erasure = known.count
    end
  end
end
