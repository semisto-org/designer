require "test_helper"

class Admin::TechTest < ActiveSupport::TestCase
  # Replaces a method for the block (the suite has no mocking library).
  def swap(object, name, implementation)
    original = object.method(name)
    object.define_singleton_method(name, &implementation)
    yield
  ensure
    object.define_singleton_method(name, original)
  end

  def with_env(values)
    previous = values.keys.index_with { |key| ENV[key] }
    values.each { |key, value| ENV[key] = value }
    yield
  ensure
    previous.each { |key, value| ENV[key] = value }
  end

  # Solid Queue's tables live in their own database in production; here they
  # are created inside the test's transaction, on the same connection.
  def with_solid_queue_tables
    ActiveRecord::Migration.suppress_messages { load Rails.root.join("db/queue_schema.rb") }
    swap(ActiveJob::Base, :queue_adapter_name, -> { "solid_queue" }) { yield }
  end

  test "names the deployed commit and links to it" do
    with_env("SOURCE_COMMIT" => "4dcd4dc8dd79c482c95cf817720c594dda875c2b") do
      version = Admin::Tech.call[:version]
      assert_equal "4dcd4dc8dd79c482c95cf817720c594dda875c2b", version[:commit]
      assert_equal "https://github.com/semisto-org/designer/commit/4dcd4dc8dd79c482c95cf817720c594dda875c2b", version[:commitUrl]
      assert_equal Rails.version, version[:rails]
    end
  end

  test "an unknown commit stays empty" do
    with_env("SOURCE_COMMIT" => nil) { assert_nil Admin::Tech.call.dig(:version, :commitUrl) }
  end

  test "counts the files of each service and reports the latest backup" do
    ActiveStorage::Blob.create_and_upload!(io: StringIO.new("plan"), filename: "plan.pdf", service_name: "test")
    BackupOrphan.create!(service_name: "backup", key: "gone", first_seen_at: 1.day.ago)
    last_run = { at: "2026-10-17T02:00:00+02:00", copied: 3, failed: 0 }
    swap(FileStorage::Backup, :last_run, -> { last_run }) do
      storage = Admin::Tech.call[:storage]
      test_service = storage[:services].find { |service| service[:name] == "test" }
      assert_operator test_service[:files], :>=, 1
      assert_operator test_service[:bytes], :>=, 4
      assert_equal last_run, storage.dig(:backup, :lastRun)
      assert_equal 1, storage.dig(:backup, :awaitingErasure)
    end
  end

  test "jobs are unavailable without Solid Queue" do
    assert_equal({ available: false }, Admin::Tech.call[:jobs])
  end

  test "reads the queue, the failed jobs and the last run of each recurring task" do
    with_solid_queue_tables do
      job = SolidQueue::Job.create!(queue_name: "default", class_name: "FileBackupJob", arguments: "{}")
      SolidQueue::FailedExecution.where(job_id: job.id).delete_all
      SolidQueue::ReadyExecution.where(job_id: job.id).delete_all
      SolidQueue::FailedExecution.create!(job:, error: { "exception_class" => "RuntimeError", "message" => "File backup: 1 failed" })
      SolidQueue::RecurringTask.create!(key: "file_backup", schedule: "every day at 2am", class_name: "FileBackupJob")
      SolidQueue::RecurringExecution.create!(task_key: "file_backup", run_at: Time.zone.parse("2026-10-17 02:00"), job_id: job.id)

      jobs = Admin::Tech.call[:jobs]
      assert jobs[:available]
      assert_equal 1, jobs[:failedCount]
      assert_equal "FileBackupJob", jobs[:failed].first[:job]
      assert_equal "RuntimeError : File backup: 1 failed", jobs[:failed].first[:error]
      task = jobs[:recurring].find { |row| row[:key] == "file_backup" }
      assert_equal Time.zone.parse("2026-10-17 02:00").iso8601, task[:lastRunAt]
    end
  end

  test "says which services are configured, never their keys" do
    with_env("SENTRY_DSN" => "https://secret@sentry.example/1", "SMTP_ADDRESS" => nil) do
      services = Admin::Tech.call[:services].to_h { |row| [ row[:key], row[:configured] ] }
      assert services[:sentry]
      assert_not services[:smtp]
      assert_not_includes Admin::Tech.call.to_json, "secret@"
    end
  end

  test "reports the latest EcoIndex measurements and whether they can be received" do
    EcoMeasurement.create!(screen: "editor", environment: "test_copy", url: "http://localhost:3000/maps/2", dom_elements: 398,
      requests: 77, bytes: 1_500_000, measured_at: Time.current)
    with_env("ECOINDEX_TOKEN" => nil) do
      sobriety = Admin::Tech.call[:sobriety]
      assert_equal [ "editor" ], sobriety[:screens].pluck(:screen)
      assert_not sobriety[:configured]
    end
  end
end

class FileStorage::BackupLastRunTest < ActiveSupport::TestCase
  test "records the figures of a run for the admin view" do
    store = ActiveSupport::Cache::MemoryStore.new
    original = Rails.cache
    Rails.cache = store
    result = FileStorage::Backup::Result.new(copied: 2, already_there: 5, missing: [ 9 ], failed: [], erased: 1, awaiting_erasure: 4)
    FileStorage::Backup.record(result, at: Time.zone.parse("2026-10-17 02:03"))
    assert_equal({ at: Time.zone.parse("2026-10-17 02:03").iso8601, copied: 2, alreadyThere: 5, missing: 1, failed: 0, erased: 1, awaitingErasure: 4 },
      FileStorage::Backup.last_run)
  ensure
    Rails.cache = original
  end
end
