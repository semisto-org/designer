require "test_helper"

class UsersRakeTest < ActiveSupport::TestCase
  setup do
    Rails.application.load_tasks unless Rake::Task.task_defined?("users:admin")
    @saved_email = ENV["EMAIL"]
  end

  teardown { @saved_email ? ENV["EMAIL"] = @saved_email : ENV.delete("EMAIL") }

  def run_task(name, email)
    email ? ENV["EMAIL"] = email : ENV.delete("EMAIL")
    Rake::Task[name].reenable
    Rake::Task[name].invoke
  end

  test "users:admin gives the staff role, users:unadmin takes it back" do
    user = users(:bob)
    assert_output(/bob@example.org is now an admin/) { run_task("users:admin", " Bob@Example.org ") }
    assert user.reload.admin?
    assert_output(/bob@example.org\n/) { run_task("users:admins", nil) }
    assert_output(/no longer an admin/) { run_task("users:unadmin", "bob@example.org") }
    assert_not user.reload.admin?
  end

  test "an unknown e-mail or a missing EMAIL stops with a message and changes nothing" do
    assert_raises(SystemExit) { capture_io { run_task("users:admin", "nobody@example.org") } }
    assert_raises(SystemExit) { capture_io { run_task("users:admin", nil) } }
    assert_equal 0, User.where(admin: true).count
  end
end
