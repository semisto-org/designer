require "test_helper"

# A deploy must not leave browsers stuck on chunks of the previous build.
class StaleBuildTest < ActionDispatch::IntegrationTest
  test "a missing asset is never cached" do
    get "/vite/assets/gone-0000.js"
    assert_response :not_found
    assert_equal "no-store", response.headers["cache-control"]
  end

  test "a missing page is never cached" do
    get "/no-such-page"
    assert_response :not_found
    assert_equal "no-store", response.headers["cache-control"]
  end

  test "the layout reloads once when a chunk of the build fails to load" do
    get "/"
    assert_includes response.body, "vite:preloadError"
    assert_includes response.body, "designer:stale-build-reload"
  end
end
