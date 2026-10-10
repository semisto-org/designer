require "test_helper"

class AppVersionsControllerTest < ActionDispatch::IntegrationTest
  test "returns the Inertia version without sign in and without caching" do
    get app_version_path
    assert_response :success
    assert_equal InertiaRails.configuration.version.to_s, response.parsed_body["version"]
    assert_includes response.headers["Cache-Control"], "no-store"
  end
end
