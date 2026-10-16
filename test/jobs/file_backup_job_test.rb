require "test_helper"

class FileBackupJobTest < ActiveJob::TestCase
  def result(failed: []) = FileStorage::Backup::Result.new(copied: 1, already_there: 0, missing: [], failed:, erased: 0, awaiting_erasure: 0)

  # Replaces a class method for the block (the suite has no mocking library).
  def swap(object, name, implementation)
    original = object.method(name)
    object.define_singleton_method(name, &implementation)
    yield
  ensure
    object.define_singleton_method(name, original)
  end

  def perform_with(result: nil, error: nil, configured: true)
    backup = Object.new
    backup.define_singleton_method(:run) { error ? raise(error) : result }
    check_ins = []
    capture = ->(slug, status, **options) { check_ins << [ slug, status, options[:check_in_id] ]; "check-in-1" }
    swap(FileStorage::Backup, :configured?, ->(*) { configured }) do
      swap(FileStorage::Backup, :new, ->(*) { backup }) do
        swap(Sentry, :capture_check_in, capture) do
          FileBackupJob.perform_now
        rescue RuntimeError
        end
      end
    end
    check_ins
  end

  test "a finished backup checks in with the Sentry monitor" do
    check_ins = perform_with(result: result)
    assert_equal [ [ "file-backup", :in_progress, nil ], [ "file-backup", :ok, "check-in-1" ] ], check_ins
  end

  test "a file it could not copy reports the run as failed" do
    check_ins = perform_with(result: result(failed: [ 42 ]))
    assert_equal [ :in_progress, :error ], check_ins.map(&:second)
  end

  test "a crash reports the run as failed and still raises" do
    check_ins = perform_with(error: RuntimeError.new("bucket gone"))
    assert_equal [ :in_progress, :error ], check_ins.map(&:second)
    assert_equal "check-in-1", check_ins.last.third
  end

  test "an unconfigured backup does not check in, so the monitor notices the missed day" do
    assert_empty perform_with(configured: false)
  end

  test "the monitor expects a backup every day" do
    config = FileBackupJob::MONITOR_CONFIG
    assert_equal({ type: :interval, value: 1, unit: :day }, config.schedule.to_h)
  end
end
