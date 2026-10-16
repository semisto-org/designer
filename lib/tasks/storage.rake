# Uploaded files: where they are, moving them to another service, the bucket's
# CORS rule and the backup copy. See FileStorage and docs/mise-en-production.md.
namespace :storage do
  desc "Count the files per service and size, and say whether the backup is configured"
  task status: :environment do
    ActiveStorage::Blob.group(:service_name).pluck(:service_name, Arel.sql("count(*)"), Arel.sql("sum(byte_size)")).each do |name, count, bytes|
      puts "#{name}: #{count} files, #{(bytes.to_f / 1.megabyte).round(1)} MB"
    end
    puts "default service: #{Rails.configuration.active_storage.service}"
    puts "backup: #{FileStorage::Backup.configured? ? "configured" : "not configured (BACKUP_S3_BUCKET)"}"
  end

  desc "Move every file from one service to another: FROM=local TO=object_storage [DRY_RUN=1]"
  task migrate: :environment do
    from = ENV.fetch("FROM", "local")
    to = ENV.fetch("TO", "object_storage")
    dry_run = ENV["DRY_RUN"].present?
    result = FileStorage::Migration.new(from:, to:).run(dry_run:)
    puts "#{dry_run ? "[dry run] " : ""}#{from} → #{to}: #{result}"
    puts "missing at the source (blob ids): #{result.missing.join(", ")}" if result.missing.any?
    puts "failed (blob ids, see the log): #{result.failed.join(", ")}" if result.failed.any?
    exit 1 if result.failed.any?
  end

  desc "Set the object storage bucket's CORS rule (read from the app's origin, APP_HOST)"
  task cors: :environment do
    abort "object_storage is not configured (S3_BUCKET)" unless FileStorage.configured?(:object_storage)
    service = FileStorage.service(:object_storage)
    FileStorage::Cors.apply(client: service.client.client, bucket: service.bucket.name, origins: FileStorage::Cors.app_origin)
    puts "CORS set on #{service.bucket.name} for #{FileStorage::Cors.app_origin}"
  end

  # Run at each boot by bin/docker-entrypoint: never fails the boot, a bucket
  # that refuses the rule only leaves a warning in the log.
  task cors_on_boot: :environment do
    next unless FileStorage.configured?(:object_storage)
    Rake::Task["storage:cors"].invoke
  rescue StandardError => e
    warn "[storage:cors] not set: #{e.class}: #{e.message}"
  end

  desc "Copy to the backup bucket the files it does not hold yet, erase those deleted 89 days ago (what FileBackupJob does every night)"
  task backup: :environment do
    abort "backup is not configured (BACKUP_S3_BUCKET)" unless FileStorage::Backup.configured?
    result = FileStorage::Backup.new.run
    puts "backup: #{result}"
    exit 1 if result.failed.any?
  end
end
