require "test_helper"
require "quality_gate"

class QualityGateTest < ActiveSupport::TestCase
  JOURNEY = { "id" => "pay", "title" => "Payer", "paths" => [ "app/frontend/pages/billing/**/*", "app/models/billing*.rb" ] }.freeze

  def gate(scores)
    QualityGate.new(journeys: [ JOURNEY.merge("scores" => scores) ])
  end

  BLOCKED = { "place" => "fail", "time" => "fail", "companion" => "partial", "notebook" => "pass", "further" => "pass" }.freeze
  PASSING = BLOCKED.merge("time" => "partial").freeze

  test "a journey that fails two questions refuses new files in its domain" do
    added = [ "app/frontend/pages/billing/receipt.tsx", "app/frontend/pages/billing/parts/Line.tsx", "app/models/billing_receipt.rb", "app/models/map.rb" ]
    assert_equal [ { journey: "pay", title: "Payer", files: added.first(3) } ], gate(BLOCKED).check(added:)
  end

  test "one failed question does not block" do
    assert_empty gate(PASSING).check(added: [ "app/frontend/pages/billing/receipt.tsx" ])
  end

  test "files outside the domain pass" do
    assert_empty gate(BLOCKED).check(added: [ "app/frontend/pages/maps/new.tsx", "app/models/map.rb" ])
  end

  test "a pull request that works on the journey says so in its description" do
    assert_empty gate(BLOCKED).check(added: [ "app/frontend/pages/billing/receipt.tsx" ], description: "Before: …\n\nQuality: pay\n")
    assert_empty gate(BLOCKED).check(added: [ "app/frontend/pages/billing/receipt.tsx" ], description: "quality: invite, pay")
    assert_not_empty gate(BLOCKED).check(added: [ "app/frontend/pages/billing/receipt.tsx" ], description: "Mentions Quality: pay in passing")
  end

  test "the notebook's journeys are well formed and their paths still exist" do
    journeys = QualityGate.load.journeys
    assert_equal %w[discover first_map invite pay plant return], journeys.map { |j| j["id"] }
    journeys.each do |journey|
      assert_equal QualityGate::QUESTIONS, journey["scores"].keys, journey["id"]
      assert journey["scores"].values.all? { |score| QualityGate::SCORES.include?(score) }, journey["id"]
      assert File.exist?(Rails.root.join("docs/quality/#{journey["month"]}.md")), "#{journey["id"]}: no notebook for #{journey["month"]}"
      journey["paths"].each do |glob|
        assert Dir.glob(Rails.root.join(glob).to_s).any?, "#{journey["id"]}: #{glob} matches no file"
      end
    end
  end
end
