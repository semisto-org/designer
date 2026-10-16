# The nightly copy of every uploaded file to the backup bucket (`backup` in
# config/storage.yml, FileBackupJob). Only the files the backup does not hold
# yet are sent; nothing is ever deleted or overwritten there, so the backup
# keeps every file a database backup may refer to.
module FileStorage
  class Backup
    Result = Struct.new(:copied, :already_there, :missing, :failed, keyword_init: true) do
      def to_s
        "#{copied} copied, #{already_there} already there, #{missing.size} missing at the source, #{failed.size} failed"
      end
    end

    def self.configured?(target = :backup) = FileStorage.configured?(target)

    def initialize(target: :backup, logger: Rails.logger)
      @target = target.to_s
      @logger = logger
    end

    def run
      target = FileStorage.service(@target)
      keys = FileStorage.keys_of(target)
      result = Result.new(copied: 0, already_there: 0, missing: [], failed: [])

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
        result.failed << blob.id
        @logger.error("[storage:backup] blob #{blob.id}: #{e.class}: #{e.message}")
      end
      result
    end
  end
end
