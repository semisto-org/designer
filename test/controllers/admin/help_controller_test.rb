require "test_helper"

class Admin::HelpControllerTest < ActionDispatch::IntegrationTest
  setup do
    @admin = User.create!(email_address: "staff@example.org", name: "Staff", admin: true)
  end

  test "staff see the guides that helped least, the comments and the searches that found nothing" do
    HelpFeedback.create!(slug: "payer-sur-facture", helpful: false, comment: "Et pour une commune ?")
    HelpFeedback.create!(slug: "formules-et-forfait", helpful: true)
    HelpSearchMiss.record("licorne")
    sign_in_as(@admin)
    get "/admin/help", headers: inertia_headers
    assert_response :success
    props = response.parsed_body["props"]
    assert_equal "payer-sur-facture", props["articles"].first["slug"]
    assert_equal [ "Et pour une commune ?" ], props["comments"].map { |c| c["comment"] }
    assert_equal [ "licorne" ], props["misses"].map { |m| m["query"] }

    delete "/admin/help/misses/#{HelpSearchMiss.last.id}"
    assert_redirected_to "/admin/help"
    assert_equal 0, HelpSearchMiss.count
  end

  test "is hidden from everyone else" do
    sign_in_as(User.create!(email_address: "lecteur@example.org", name: "Lecteur"))
    get "/admin/help"
    assert_response :not_found
  end
end
