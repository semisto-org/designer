require "test_helper"
require_relative "../test_helpers/teams_test_helper"
require_relative "../test_helpers/billing_test_helper"

# Pricing templates: mine with a professional plan, my teams' (admins edit).
class OfferTemplatesControllerTest < ActionDispatch::IntegrationTest
  include BillingTestHelper

  setup do
    @admin = users(:michael)
    @member = users(:bob)
    @team = make_team("Semisto", admin: @admin, members: [ @member ])
  end

  test "the list shows my account and my teams', and a copy of Semisto's starts one" do
    sign_in_as @admin
    get offer_templates_path, headers: inertia_headers
    accounts = response.parsed_body["props"]["accounts"]
    assert_equal [ "me", "team-#{@team.id}" ], accounts.map { _1["key"] }
    assert accounts.all? { _1["canEdit"] }

    assert_difference -> { OfferTemplate.count } do
      post offer_templates_path, params: { account: "team-#{@team.id}" }
    end
    template = OfferTemplate.last
    assert_equal @team, template.owner
    assert_redirected_to edit_offer_template_path(template)
    assert_equal Offer::Pricing.semisto.to_h, template.data

    post offer_templates_path, params: { account: "team-#{@team.id}", from: template.id }
    assert_equal "Barème Semisto (copie)", OfferTemplate.last.name
  end

  test "an admin edits a team template; its data is typed on the way in" do
    template = OfferTemplate.copy_for(@team).tap(&:save!)
    sign_in_as @admin
    get edit_offer_template_path(template), headers: inertia_headers
    props = response.parsed_body["props"]
    assert_equal "offer_templates/edit", response.parsed_body["component"]
    assert_includes props["vocabulary"]["drivers"], "plants"

    data = template.data.deep_dup
    data["settings"]["hourly_rate"] = "75"
    data["tasks"].first["gain_pct"] = 500
    patch offer_template_path(template), params: { template: { name: "Communes", client_types: %w[commune], data: } }, as: :json
    assert_response :success
    template.reload
    assert_equal [ "Communes", %w[commune], 75.0, 90 ], [ template.name, template.client_types, template.data["settings"]["hourly_rate"], template.data["tasks"].first["gain_pct"] ]
  end

  test "team members read the templates, only admins change them" do
    template = OfferTemplate.copy_for(@team).tap(&:save!)
    sign_in_as @member
    get offer_templates_path, headers: inertia_headers
    team = response.parsed_body["props"]["accounts"].find { _1["key"] == "team-#{@team.id}" }
    assert_equal false, team["canEdit"]
    assert_equal [ template.id ], team["templates"].map { _1["id"] }

    patch offer_template_path(template), params: { template: { name: "Pirate" } }, as: :json
    assert_response :forbidden
    assert_no_difference -> { OfferTemplate.count } do
      post offer_templates_path, params: { account: "team-#{@team.id}" }
    end
    assert_response :not_found
  end

  test "someone else's template is out of reach" do
    template = OfferTemplate.copy_for(users(:alice)).tap(&:save!)
    sign_in_as @admin
    get edit_offer_template_path(template), headers: inertia_headers
    assert_response :not_found
  end

  test "own templates need a professional plan once billing is on" do
    with_billing do
      sign_in_as @member
      get offer_templates_path, headers: inertia_headers
      assert_equal [ "team-#{@team.id}" ], response.parsed_body["props"]["accounts"].map { _1["key"] }
      post offer_templates_path, params: { account: "me" }
      assert_response :not_found
    end
  end

  test "deleting a template sends its offers back to Semisto's pricing" do
    map = maps(:ahinvaux)
    map.update!(organization: @team)
    template = OfferTemplate.copy_for(@team).tap(&:save!)
    offer = Offer.create!(map:, offer_template: template, inputs: {})
    sign_in_as @admin
    delete offer_template_path(template)
    assert_redirected_to offer_templates_path
    assert_nil offer.reload.offer_template_id
  end
end
