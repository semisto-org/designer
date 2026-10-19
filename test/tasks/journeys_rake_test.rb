require "test_helper"

class JourneysRakeTest < ActiveSupport::TestCase
  setup { Rails.application.load_tasks unless Rake::Task.task_defined?("journeys:prepare") }

  def prepare(out)
    with_out(out) do
      Rake::Task["journeys:prepare"].reenable
      assert_output(/"desktop":/) { Rake::Task["journeys:prepare"].invoke }
    end
  end

  def with_out(out)
    saved = ENV["OUT"]
    ENV["OUT"] = out
    yield
  ensure
    saved ? ENV["OUT"] = saved : ENV.delete("OUT")
  end

  test "prepares one set of accounts and gardens per device, and starts over on every run" do
    Dir.mktmpdir do |dir|
      out = File.join(dir, "ids.json")
      prepare(out)
      ids = JSON.parse(File.read(out))
      assert_equal %w[desktop phone], ids.keys

      phone = ids["phone"]
      map = Map.find(phone["map"])
      assert_equal "jardinier-phone@journeys.test", map.owner.email_address
      assert_includes map.features.where(layer: "plants").ids, phone["plant"]
      assert_equal "/invitations/journeys-invitation-phone", phone["invitation"]
      returning = Map.find(phone["return_map"])
      assert returning.updated_at < 2.months.ago
      assert returning.features.where(layer: "plants").all? { |plant| plant.properties["planted_on"].present? }

      prepare(out)
      assert_not Map.exists?(phone["map"])
      assert_equal 2, User.where(email_address: "jardinier-phone@journeys.test").or(User.where(email_address: "jardinier-desktop@journeys.test")).count
    end
  end
end
