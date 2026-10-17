require "test_helper"

class EcoMeasurementsControllerTest < ActionDispatch::IntegrationTest
  ROW = { screen: "editor", environment: "test_copy", url: "http://localhost:3000/maps/2", dom_elements: 398, requests: 77,
          bytes: 1_500_000, measured_at: "2026-10-17T20:00:00Z" }.freeze

  setup { @previous = ENV["ECOINDEX_TOKEN"] }
  teardown { ENV["ECOINDEX_TOKEN"] = @previous }

  def send_rows(rows, token: "secret-token")
    post "/eco_measurements", params: { commit: "abc123", measurements: rows }, as: :json,
      headers: { "Authorization" => "Bearer #{token}" }
  end

  test "does not exist without a token in the environment" do
    ENV["ECOINDEX_TOKEN"] = nil
    send_rows([ ROW ])
    assert_response :not_found
  end

  test "refuses a wrong token" do
    ENV["ECOINDEX_TOKEN"] = "secret-token"
    assert_no_difference("EcoMeasurement.count") { send_rows([ ROW ], token: "wrong") }
    assert_response :unauthorized
  end

  test "stores the measurements and computes their grade" do
    ENV["ECOINDEX_TOKEN"] = "secret-token"
    assert_difference("EcoMeasurement.count", 1) { send_rows([ ROW ]) }
    assert_response :created
    row = EcoMeasurement.last
    assert_equal [ "editor", "abc123" ], [ row.screen, row.commit ]
    assert_equal row.grade, response.parsed_body.dig("screens", 0, "grade")
  end

  test "stores nothing when one row is invalid" do
    ENV["ECOINDEX_TOKEN"] = "secret-token"
    assert_no_difference("EcoMeasurement.count") { send_rows([ ROW, ROW.merge(screen: "nope") ]) }
    assert_response :unprocessable_entity
  end
end
