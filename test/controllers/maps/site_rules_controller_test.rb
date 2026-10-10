require "test_helper"
require_relative "../../support/regions_test_helper"
require_relative "../../support/site_rules_test_helper"

class Maps::SiteRulesControllerTest < ActionDispatch::IntegrationTest
  include RegionsTestHelper
  include SiteRulesTestHelper

  setup do
    seed_regions
    seed_site_rules
  end

  test "requires sign in and a role on the map" do
    map = france_map(owner: users(:michael))
    get map_site_rules_path(map), as: :json
    assert_response :unauthorized unless response.redirect?
    sign_in_as users(:bob)
    get map_site_rules_path(map), as: :json
    assert_response :not_found
  end

  test "France: the report of the map, for everyone with a role" do
    stub_georisques
    stub_gpu("lyon")
    map = france_map(owner: users(:michael))
    sign_in_as users(:michael)
    get map_site_rules_path(map), as: :json
    assert_response :success
    json = response.parsed_body
    assert json["risks"]["available"]
    assert_equal "UCe1b", json["urbanism"]["zones"].sole["label"]
  end

  test "Wallonia: not configured yet, points to the plan de secteur layer" do
    map = maps(:ahinvaux)
    map.update!(region: region("wallonia"))
    sign_in_as users(:alice)
    get map_site_rules_path(map), as: :json
    assert_response :success
    assert_not response.parsed_body["configured"]
    assert_includes response.parsed_body["layers"].map { _1["key"] }, "plan_secteur"
  end
end
