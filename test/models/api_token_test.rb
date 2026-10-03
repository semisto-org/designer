require "test_helper"

class ApiTokenTest < ActiveSupport::TestCase
  test "stores only a digest and authenticates the plaintext once shown" do
    token = ApiToken.create!(user: users(:michael), name: "Script", access: "drafts")
    assert token.plaintext.start_with?("sdp_")
    refute_includes token.attributes.values.map(&:to_s), token.plaintext
    assert_equal token, ApiToken.authenticate(token.plaintext)
    assert_equal %w[maps:read maps:drafts], token.scope_list
    assert_nil ApiToken.authenticate("sda_#{token.plaintext}")
    assert_nil ApiToken.find(token.id).plaintext
  end

  test "limits active tokens per user" do
    ApiToken::MAX_ACTIVE_PER_USER.times { |i| ApiToken.create!(user: users(:bob), name: "T#{i}") }
    token = ApiToken.new(user: users(:bob), name: "Trop")
    refute token.valid?
  end
end
