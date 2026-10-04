require "test_helper"

class PwaManifestTest < ActionDispatch::IntegrationTest
  test "the manifest names the app in French and points to icons that exist" do
    get "/manifest.json"
    assert_response :success
    manifest = response.parsed_body
    assert_equal [ "Semisto Designer", "Designer", "fr", "/maps" ], manifest.values_at("name", "short_name", "lang", "start_url")
    assert_equal I18n.t("meta.description"), manifest["description"]
    assert_includes manifest["icons"].map { |icon| icon["purpose"] }, "maskable"
    manifest["icons"].each { |icon| assert Rails.public_path.join(icon["src"].delete_prefix("/")).file?, icon["src"] }
  end

  test "the layout links the app icons" do
    get "/"
    %w[/favicon-32.png /icon.svg /apple-touch-icon.png].each do |path|
      assert_includes response.body, %(href="#{path}")
      assert Rails.public_path.join(path.delete_prefix("/")).file?, path
    end
  end
end
