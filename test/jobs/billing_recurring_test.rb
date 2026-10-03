require "test_helper"

class BillingRecurringTest < ActiveSupport::TestCase
  test "the daily billing job is scheduled in production and its class exists" do
    entry = YAML.load_file(Rails.root.join("config/recurring.yml")).dig("production", "billing_daily")
    assert_equal "BillingDailyJob", entry["class"]
    assert_equal BillingDailyJob, entry["class"].constantize
    assert_equal "every day at 8am", entry["schedule"]
  end

  test "the rake task sends the reminders" do
    Rails.application.load_tasks unless Rake::Task.task_defined?("billing:renewal_reminders")
    assert_output(/0 renewal reminder/) { Rake::Task["billing:renewal_reminders"].execute }
  end
end
