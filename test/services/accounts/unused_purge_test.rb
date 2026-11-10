require "test_helper"

class Accounts::UnusedPurgeTest < ActiveSupport::TestCase
  def unused(email, age: 31.days, **attrs)
    User.create!(email_address: email, created_at: age.ago, **attrs)
  end

  test "erases accounts never opened after 30 days, keeps the rest" do
    gone = unused("never@example.org")
    recent = unused("recent@example.org", age: 10.days)
    opened = unused("opened@example.org", last_signed_in_at: 20.days.ago)
    google = unused("google@example.org", google_uid: "g-1")
    with_password = unused("pw@example.org", password: "a long secret phrase")
    member = unused("member@example.org")
    MapMembership.create!(map: maps(:ahinvaux), user: member, role: "viewer")

    assert_equal 1, Accounts::UnusedPurge.call
    assert_not User.exists?(gone.id)
    [ recent, opened, google, with_password, member ].each { |user| assert User.exists?(user.id), user.email_address }
  end

  test "a trial claimed by the address loses its claimant, not its place" do
    user = unused("trial@example.org")
    trial = MapTrial.create!(center: GeoJsonGeometry::FACTORY.point(4.9, 50.34), claimant: user, origin: "home")
    Accounts::UnusedPurge.call
    assert_nil trial.reload.claimant_id
  end

  test "the stores' review account stays" do
    user = unused("review@example.org")
    ENV["APP_REVIEW_EMAIL"] = "review@example.org"
    assert_equal 0, Accounts::UnusedPurge.call
    assert User.exists?(user.id)
  ensure
    ENV.delete("APP_REVIEW_EMAIL")
  end
end
