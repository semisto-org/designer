require "test_helper"

# designer.semisto.org, the first address, sends its pages to
# terranova.semisto.org and keeps serving what machines call.
class LegacyHostRedirectTest < ActionDispatch::IntegrationTest
  setup { host! "designer.semisto.org" }

  test "a page on the old host moves to the same path on the new one" do
    get "/maps/12?tab=photos"
    assert_response :moved_permanently
    assert_equal "https://terranova.semisto.org/maps/12?tab=photos", response.location

    get "/"
    assert_equal "https://terranova.semisto.org/", response.location
  end

  test "the MCP server, OAuth, the API, .well-known and the health check stay on the old host" do
    %w[/mcp /oauth/authorize /.well-known/oauth-authorization-server /api/v1/maps /up].each do |path|
      get path
      refute_equal 301, response.status, "#{path} must not redirect"
    end
  end

  test "posts are served where they are sent (webhooks, forms)" do
    post "/webhooks/stripe", params: "{}", headers: { "CONTENT_TYPE" => "application/json" }
    refute_equal 301, response.status
  end

  test "the new host and any other host are left alone" do
    host! "terranova.semisto.org"
    get "/"
    refute_equal 301, response.status
  end

  test "LEGACY_HOSTS replaces the list of old hosts, and never holds the current one" do
    with_env("LEGACY_HOSTS" => "old.example.org, terranova.semisto.org") do
      assert_equal [ "old.example.org" ], AppHosts.legacy
      refute AppHosts.legacy?("designer.semisto.org")
    end
    with_env("APP_HOST" => "designer.semisto.org") do
      assert_equal "designer.semisto.org", AppHosts.primary
      assert_empty AppHosts.legacy
    end
  end

  test "with APP_HOST set, the MCP endpoints follow the old host for a request made there" do
    with_env("APP_HOST" => "terranova.semisto.org") do
      old = ActionDispatch::TestRequest.create("HTTP_HOST" => "designer.semisto.org")
      current = ActionDispatch::TestRequest.create("HTTP_HOST" => "terranova.semisto.org")
      assert_equal "https://designer.semisto.org", Mcp::Endpoints.origin(old)
      assert_equal "https://terranova.semisto.org", Mcp::Endpoints.origin(current)
      assert_equal "https://terranova.semisto.org", Mcp::Endpoints.origin
    end
  end

  private
    def with_env(values)
      saved = values.keys.to_h { |key| [ key, ENV[key] ] }
      values.each { |key, value| ENV[key] = value }
      yield
    ensure
      saved.each { |key, value| ENV[key] = value }
    end
end
