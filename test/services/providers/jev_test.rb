require "test_helper"
require_relative "../../test_helpers/jev_test_helper"

class Providers::JevTest < ActiveSupport::TestCase
  include JevTestHelper

  test "sends the state and the questions, and reads the answers" do
    stub_jev { |state, questions| { "q" => { "choice" => questions.dig("q", "criteria").keys.first, "confidence" => 0.9, "seen" => state["plant"] } } }
    answers = Providers::Jev.new(api_key: "key").ask(state: { plant: "Salvia" }, questions: { "q" => { type: "choice", criteria: { "a" => "A" } } })
    assert_equal({ "choice" => "a", "confidence" => 0.9, "seen" => "Salvia" }, answers["q"])
    assert_requested(:post, JevTestHelper::JEV, headers: { "Authorization" => "Bearer key" })
  end

  test "retries when TypeSafe is overloaded, then says it is unavailable" do
    stub_request(:post, JevTestHelper::JEV).to_return({ status: 529 }, { status: 200, body: { answers: { "q" => {} } }.to_json })
    jev = Providers::Jev.new(api_key: "key", sleeper: ->(_) { })
    assert_equal({ "q" => {} }, jev.ask(state: {}, questions: { "q" => {} }))

    stub_request(:post, JevTestHelper::JEV).to_return(status: 401)
    assert_raises(Providers::Jev::Unavailable) { jev.ask(state: {}, questions: { "q" => {} }) }
    assert_raises(Providers::Jev::Unavailable) { Providers::Jev.new(api_key: nil).ask(state: {}, questions: { "q" => {} }) }
    assert_not Providers::Jev.build({}).available?
  end
end
