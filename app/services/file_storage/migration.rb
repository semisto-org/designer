# Moves the files of every blob from one Active Storage service to another,
# e.g. from the server's disk (`local`) to the object storage bucket:
#
#   bin/rails storage:migrate FROM=local TO=object_storage   (DRY_RUN=1 to only count)
#
# Each file is copied with its checksum checked, then the blob is pointed at
# the new service, one by one: a blob is served from its new place as soon as
# it is copied, and the run can be stopped and started again at any time. The
# source file is never deleted (remove the old volume by hand, once verified).
module FileStorage
  class Migration
    Result = Struct.new(:copied, :already_there, :missing, :failed, keyword_init: true) do
      def to_s
        "#{copied} copied, #{already_there} already there, #{missing.size} missing at the source, #{failed.size} failed"
      end
    end

    def initialize(from:, to:, logger: Rails.logger)
      @from = from.to_s
      @to = to.to_s
      @logger = logger
    end

    def run(dry_run: false)
      raise ArgumentError, "#{@to} is not configured in config/storage.yml" unless FileStorage.configured?(@to)
      source = FileStorage.service(@from)
      target = FileStorage.service(@to)
      keys = FileStorage.keys_of(target)
      result = Result.new(copied: 0, already_there: 0, missing: [], failed: [])

      ActiveStorage::Blob.where(service_name: @from).find_each do |blob|
        if FileStorage.holds?(target, keys, blob.key)
          result.already_there += 1
        elsif !source.exist?(blob.key)
          result.missing << blob.id
          next
        else
          FileStorage.copy(blob, target) unless dry_run
          result.copied += 1
        end
        blob.update_columns(service_name: @to) unless dry_run
      rescue StandardError => e
        result.failed << blob.id
        @logger.error("[storage:migrate] blob #{blob.id}: #{e.class}: #{e.message}")
      end
      result
    end
  end
end
