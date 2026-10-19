require "test_helper"

class Maps::WeeksControllerTest < ActionDispatch::IntegrationTest
  setup { @map = maps(:ahinvaux) }

  test "a viewer reads the week, with the forecast from MET Norway" do
    stub_request(:get, %r{api\.met\.no/weatherapi/locationforecast/2\.0/complete})
      .to_return(status: 200, body: file_fixture("met_norway/forecast.json").read, headers: { "Content-Type" => "application/json" })
    sign_in_as users(:alice)
    get map_week_path(@map), as: :json
    assert_response :success
    body = response.parsed_body
    assert body["forecast"]["available"]
    assert_equal "MET Norway", body["forecast"]["attribution"]["name"]
    assert_equal "frost", body["forecast"]["alerts"].first["kind"]
    assert body["season"]["title"].present?
    assert_equal %w[flowering harvest pruning], body["plants"].keys
  end

  test "someone outside the map gets nothing" do
    sign_in_as users(:bob)
    get map_week_path(@map), as: :json
    assert_response :not_found
  end
end
