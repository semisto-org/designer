require "test_helper"

class BillingMailerTest < ActionMailer::TestCase
  setup do
    @user = users(:bob)
    @purchase = @user.plan_purchases.create!(plan_key: "yearly", starts_at: 11.months.ago, expires_at: 1.month.from_now, stripe_checkout_session_id: "cs_1")
  end

  test "the renewal reminder names the places the plan covers and what the money supports" do
    Map.create!(name: "Le verger", owner: @user, region: regions(:wallonia), created_at: 2.days.ago,
                boundary: { "type" => "MultiPolygon", "coordinates" => [ [ [ [ 4.9, 50.3 ], [ 4.901, 50.3 ], [ 4.901, 50.301 ], [ 4.9, 50.3 ] ] ] ] })
    Map.create!(name: "La mare", owner: @user, region: regions(:wallonia))
    mail = BillingMailer.renewal_reminder(@purchase, "d30")
    text = mail.text_part.body.to_s
    assert_includes text, "Elle couvre tes lieux « Le verger » et « La mare »."
    assert_includes text, I18n.t("billing.supports")
    assert mail.attachments["lieu.png"], "the oldest place's vignette"
    assert_includes mail.html_part.body.to_s, ERB::Util.html_escape("« Le verger »")
  end

  test "the notice after expiry does not say the plan still covers anything" do
    Map.create!(name: "Le verger", owner: @user, region: regions(:wallonia))
    mail = BillingMailer.renewal_reminder(@purchase, "expired")
    assert_not_includes mail.text_part.body.to_s, "Elle couvre"
  end
end
