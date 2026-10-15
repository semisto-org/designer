require "test_helper"

class FileStorage::MigrationTest < ActiveSupport::TestCase
  setup { @mirror = FileStorage.service(:test_mirror) }
  # Only this test's keys: the parallel workers share the directory.
  teardown { ActiveStorage::Blob.pluck(:key).each { |key| @mirror.delete(key) } }

  def blob(content = "photo bytes")
    ActiveStorage::Blob.create_and_upload!(io: StringIO.new(content), filename: "photo.jpg", content_type: "image/jpeg", service_name: "test")
  end

  test "copies each file with the same key, points the blob at the new service and keeps the source" do
    a = blob("first")
    b = blob("second")
    result = FileStorage::Migration.new(from: :test, to: :test_mirror).run

    assert_equal 2, result.copied
    [ a, b ].each do |record|
      record.reload
      assert_equal "test_mirror", record.service_name
      assert @mirror.exist?(record.key)
      assert FileStorage.service(:test).exist?(record.key), "the source file stays"
    end
    assert_equal "second", b.download
  end

  test "a second run copies nothing, and a file already at the target is not sent again" do
    record = blob
    @mirror.upload(record.key, StringIO.new("photo bytes"), checksum: record.checksum)
    result = FileStorage::Migration.new(from: :test, to: :test_mirror).run

    assert_equal 0, result.copied
    assert_equal 1, result.already_there
    assert_equal "test_mirror", record.reload.service_name
    assert_equal 0, FileStorage::Migration.new(from: :test, to: :test_mirror).run.already_there
  end

  test "a file missing at the source is reported and its blob left alone" do
    record = blob
    FileStorage.service(:test).delete(record.key)
    result = FileStorage::Migration.new(from: :test, to: :test_mirror).run

    assert_equal [ record.id ], result.missing
    assert_equal "test", record.reload.service_name
  end

  test "a dry run changes nothing" do
    record = blob
    result = FileStorage::Migration.new(from: :test, to: :test_mirror).run(dry_run: true)

    assert_equal 1, result.copied
    assert_equal "test", record.reload.service_name
    assert_not @mirror.exist?(record.key)
  end

  test "a file whose content no longer matches its checksum is not moved" do
    record = blob
    File.write(FileStorage.service(:test).path_for(record.key), "tampered")
    result = FileStorage::Migration.new(from: :test, to: :test_mirror, logger: Logger.new(nil)).run

    assert_equal [ record.id ], result.failed
    assert_equal "test", record.reload.service_name
  end

  test "refuses a target that is not configured" do
    assert_raises(ArgumentError) { FileStorage::Migration.new(from: :test, to: :nowhere).run }
  end
end
