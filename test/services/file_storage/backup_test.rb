require "test_helper"

class FileStorage::BackupTest < ActiveSupport::TestCase
  # A disk of its own: the parallel workers' files would look orphaned here.
  setup do
    @dir = Dir.mktmpdir("backup")
    @backup = ActiveStorage::Service::DiskService.new(root: @dir)
  end
  teardown { FileUtils.rm_rf(@dir) }

  def blob(content = "document bytes")
    ActiveStorage::Blob.create_and_upload!(io: StringIO.new(content), filename: "plan.pdf", content_type: "application/pdf", service_name: "test")
  end

  def run_backup(now: Time.current, **options) = FileStorage::Backup.new(target: :test_backup, service: @backup, **options).run(now:)

  # The blob's row only: Blob#delete would remove its file.
  def forget(record) = ActiveStorage::Blob.where(id: record.id).delete_all

  test "copies the new files only" do
    blob("first")
    assert_equal 1, run_backup.copied

    second = blob("second")
    result = run_backup
    assert_equal 1, result.copied
    assert_equal 1, result.already_there
    assert_equal "second", @backup.download(second.key)
    assert_equal "test", second.reload.service_name, "the blob still lives where it was"
  end

  test "keeps a file the app deleted for the retention period, then erases it" do
    kept = blob("kept")
    deleted = blob("deleted")
    run_backup
    deleted.purge

    result = run_backup(now: 1.day.from_now)
    assert @backup.exist?(deleted.key), "a database backup of these days can still be restored"
    assert_equal 1, result.awaiting_erasure

    result = run_backup(now: 1.day.from_now + FileStorage::Backup::RETENTION - 1.minute)
    assert @backup.exist?(deleted.key), "the clock started the night it was first seen"

    result = run_backup(now: 1.day.from_now + FileStorage::Backup::RETENTION)
    assert_not @backup.exist?(deleted.key)
    assert_equal 1, result.erased
    assert_equal 0, result.awaiting_erasure
    assert @backup.exist?(kept.key)
    assert_not BackupOrphan.exists?
  end

  test "forgets an orphan whose blob comes back" do
    record = blob
    run_backup
    key = record.key
    forget(record)
    run_backup
    assert BackupOrphan.exists?(key:)

    ActiveStorage::Blob.create!(key:, filename: "plan.pdf", byte_size: record.byte_size, checksum: record.checksum, service_name: "test")
    run_backup(now: 100.days.from_now)
    assert @backup.exist?(key)
    assert_not BackupOrphan.exists?(key:)
  end

  test "erases nothing when most of the backup has no blob" do
    records = 4.times.map { |i| blob("file #{i}") }
    run_backup
    records.first(2).each { forget(_1) }

    error = assert_raises(RuntimeError) { run_backup(alarm_floor: 1) }
    assert_match "Nothing erased", error.message
    assert_not BackupOrphan.exists?
    records.each { |record| assert @backup.exist?(record.key) }
  end

  test "reports a file missing at the source" do
    record = blob
    FileStorage.service(:test).delete(record.key)
    assert_equal [ record.id ], run_backup.missing
  end

  test "is configured only when its bucket is set" do
    assert FileStorage::Backup.configured?(:test_backup)
    assert_not FileStorage::Backup.configured?(:nowhere)
    assert_not FileStorage::Backup.configured?, "BACKUP_S3_BUCKET is not set in tests"
  end

  test "the nightly job does nothing while the backup is not configured" do
    record = blob
    assert_nothing_raised { FileBackupJob.perform_now }
    assert_not FileStorage.service(:test_backup).exist?(record.key)
  end
end
