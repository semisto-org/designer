require "test_helper"
require_relative "../../test_helpers/teams_test_helper"
require_relative "../../test_helpers/forms_test_helper"

class Webhooks::TallyControllerTest < ActionDispatch::IntegrationTest
  setup do
    @team = make_team("Design Labs", admin: users(:michael))
    @map = maps(:ahinvaux)
    @map.update!(organization: @team)
    @inbox = FormInbox.for(@team)
  end

  def deliver(event, signature: :valid, token: @inbox.token)
    body = event.to_json
    signature = tally_signature(@inbox, body) if signature == :valid
    post tally_webhook_path(token), params: body, headers: { "Content-Type" => "application/json", "Tally-Signature" => signature }.compact
  end

  test "a signed answer is filed in its map" do
    deliver tally_event(map: @map)
    assert_response :success
    assert_equal "filed", response.parsed_body["status"]
    assert_equal [ "Retour en fin de projet · 14 octobre 2026" ], @map.documents.pluck(:title)
  end

  test "an answer without a map waits, and a redelivery changes nothing" do
    2.times { deliver tally_event }
    assert_response :success
    assert_equal "unfiled", response.parsed_body["status"]
    assert_equal 1, @inbox.responses.unfiled.count
  end

  test "a wrong or missing signature, or an unknown address, is refused" do
    deliver tally_event(map: @map), signature: "bm9wZQ=="
    assert_response :unauthorized
    deliver tally_event(map: @map), signature: nil
    assert_response :unauthorized
    deliver tally_event(map: @map), token: "x" * 32
    assert_response :not_found
    assert_equal 0, FormResponse.count
  end

  test "other events are acknowledged and ignored" do
    deliver({ "eventType" => "FORM_UPDATED", "data" => {} })
    assert_response :success
    assert_equal "ignored", response.parsed_body["status"]
  end
end
