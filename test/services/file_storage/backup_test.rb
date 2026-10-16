require "test_helper"

class FileStorage::BackupTest < ActiveSupport::TestCase
  setup { @backup = FileStorage.service(:test_backup) }
  # Only this test's keys: the parallel workers share the directory.
  teardown { @keys.to_a.each { |key| @backup.delete(key) } }

  def blob(content = "document bytes")
    ActiveStorage::Blob.create_and_upload!(io: StringIO.new(content), filename: "plan.pdf", content_type: "application/pdf", service_name: "test")
      .tap { |record| (@keys ||= []) << record.key }
  end

  test "copies the new files only, and keeps those the app deleted" do
    first = blob("first")
    assert_equal 1, FileStorage::Backup.new(target: :test_backup).run.copied

    second = blob("second")
    result = FileStorage::Backup.new(target: :test_backup).run
    assert_equal 1, result.copied
    assert_equal 1, result.already_there
    assert_equal "second", @backup.download(second.key)
    assert_equal "test", second.reload.service_name, "the blob still lives where it was"

    first.purge
    FileStorage::Backup.new(target: :test_backup).run
    assert @backup.exist?(first.key), "the backup never deletes"
  end

  test "reports a file missing at the source" do
    record = blob
    FileStorage.service(:test).delete(record.key)
    assert_equal [ record.id ], FileStorage::Backup.new(target: :test_backup).run.missing
  end

  test "is configured only when its bucket is set" do
    assert FileStorage::Backup.configured?(:test_backup)
    assert_not FileStorage::Backup.configured?(:nowhere)
    assert_not FileStorage::Backup.configured?, "BACKUP_S3_BUCKET is not set in tests"
  end

  test "the nightly job does nothing while the backup is not configured" do
    record = blob
    assert_nothing_raised { FileBackupJob.perform_now }
    assert_not @backup.exist?(record.key)
  end
end
