require "test_helper"

class Providers::SemistoMembershipTest < ActiveSupport::TestCase
  URL = "https://app.semisto.org/api/v1/asbl/standing".freeze

  def provider(token: "standing-token") = Providers::SemistoMembership.new(url: "https://app.semisto.org/api/v1", token:)

  test "asks the internal app with the dedicated token and the e-mail in lower case" do
    stub_request(:post, URL).with(body: { email: "ana@example.org" }.to_json, headers: { "Authorization" => "Bearer standing-token" })
      .to_return(body: { in_good_standing: true, paid_through: "2026-12-31" }.to_json)
    standing = provider.standing(" Ana@Example.org ")
    assert standing.in_good_standing
    assert_equal Date.new(2026, 12, 31), standing.paid_through
  end

  test "is not configured without its token, and errors become Unavailable" do
    refute provider(token: nil).configured?
    assert_raises(Providers::SemistoMembership::Unavailable) { provider(token: nil).standing("ana@example.org") }
    stub_request(:post, URL).to_return(status: 401, body: "{}")
    assert_raises(Providers::SemistoMembership::Unavailable) { provider.standing("ana@example.org") }
    stub_request(:post, URL).to_return(body: "not json")
    assert_raises(Providers::SemistoMembership::Unavailable) { provider.standing("ana@example.org") }
  end
end
