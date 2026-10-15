require "test_helper"
require_relative "../../test_helpers/teams_test_helper"

# The offer builder: who may use it, page, autosave, pricing, versions.
class Maps::OffersControllerTest < ActionDispatch::IntegrationTest
  setup do
    @map = maps(:ahinvaux) # owner: michael, viewer: alice
    @owner = users(:michael)
    @owner.update!(account_kind: "professional")
    @colleague = users(:bob)
    @team = make_team("Semisto", admin: @owner, members: [ @colleague ])
  end

  def inputs
    { settings: { designers: 2 }, scope: [ { id: "a", planting_type: "forest_garden", measure: 2_000 } ] }
  end

  test "a guest of a map outside a team (maybe the client) never sees the builder" do
    sign_in_as users(:alice)
    get map_offer_path(@map), headers: inertia_headers
    assert_redirected_to map_path(@map)
    assert_no_difference -> { Offer.count } do
      patch map_offer_path(@map), params: { offer: { inputs:, lock_version: 0 } }, as: :json
    end
    assert_response :forbidden
  end

  test "the owner of a map outside a team prices it with their own templates" do
    sign_in_as @owner
    mine = OfferTemplate.copy_for(@owner, name: "Particulier").tap(&:save!)
    others = OfferTemplate.copy_for(@team, name: "Équipe").tap(&:save!)
    get map_offer_path(@map), headers: inertia_headers
    props = response.parsed_body["props"]
    assert props["canUseOffers"]
    assert_equal [ "Particulier" ], props["templates"].map { _1["name"] }
    assert_equal mine.id, props["offer"]["templateId"]
    assert_equal "Particulier", props["offer"]["pricing"]["name"]

    patch map_offer_path(@map), params: { offer: { inputs:, template_id: "", lock_version: 0 } }, as: :json
    assert_response :success
    assert_nil @map.reload.offer.offer_template
    assert_nil response.parsed_body["offer"]["pricing"]["name"]

    patch map_offer_path(@map), params: { offer: { inputs:, template_id: others.id, lock_version: @map.offer.lock_version } }, as: :json
    assert_response :not_found
  end

  test "team members get a prefilled offer, saved at the first change" do
    @map.update!(organization: @team)
    sign_in_as @colleague
    assert_no_difference -> { Offer.count } do
      get map_offer_path(@map), headers: inertia_headers
    end
    props = response.parsed_body["props"]
    assert props["canUseOffers"]
    assert_equal false, props["offer"]["persisted"]
    assert_equal %w[pre_design design implementation], props["result"]["phases"].map { _1["key"] }
    assert props["canEdit"]

    patch map_offer_path(@map), params: { offer: { inputs:, lock_version: 0 } }, as: :json
    assert_response :success
    body = response.parsed_body
    assert body["offer"]["persisted"]
    assert_equal 2, body["offer"]["inputs"]["settings"]["designers"]
    assert_equal 2_000, body["measures"]["scope"].first["measure"]
    assert_equal @colleague, @map.reload.offer.updated_by
  end

  test "a viewer outside the team is kept out, even of the JSON" do
    @map.update!(organization: @team)
    sign_in_as users(:alice)
    get map_offer_path(@map), headers: inertia_headers
    assert_redirected_to map_path(@map)
    get map_offer_path(@map, format: :json)
    assert_response :forbidden
  end

  test "a personal account never sees the builder on its own map; a team map shows it to every member" do
    @owner.update!(account_kind: "individual")
    sign_in_as @owner
    get map_offer_path(@map), headers: inertia_headers
    assert_redirected_to map_path(@map)
    get map_path(@map), headers: inertia_headers
    assert_equal false, response.parsed_body["props"]["offerBuilder"]

    @map.update!(organization: @team)
    get map_path(@map), headers: inertia_headers
    assert response.parsed_body["props"]["offerBuilder"]
    get map_offer_path(@map), headers: inertia_headers
    assert response.parsed_body["props"]["canUseOffers"]
  end

  test "the other views of the map list « Offre » only for whoever prices the project" do
    sign_in_as @owner
    [ map_documents_path(@map), map_photos_path(@map), map_tasks_path(@map), map_project_path(@map), map_offer_path(@map) ].each do |path|
      get path, headers: inertia_headers
      assert response.parsed_body["props"]["map"]["offerBuilder"], path
    end

    @owner.update!(account_kind: "individual")
    get map_documents_path(@map), headers: inertia_headers
    assert_equal false, response.parsed_body["props"]["map"]["offerBuilder"]
  end

  test "stale saves are refused with the teammate's version" do
    @map.update!(organization: @team)
    sign_in_as @owner
    patch map_offer_path(@map), params: { offer: { inputs:, lock_version: 0 } }, as: :json # created
    patch map_offer_path(@map), params: { offer: { inputs: inputs.merge(notes: "Accès en pente"), lock_version: 0 } }, as: :json # now 1
    assert_response :success
    patch map_offer_path(@map), params: { offer: { inputs: { settings: { designers: 1 } }, lock_version: 0 } }, as: :json
    assert_response :conflict
    assert_equal 2, response.parsed_body["offer"]["inputs"]["settings"]["designers"]
  end

  test "versions: save V1, change, save V2, mark sent, restore V1, read it" do
    @map.update!(organization: @team)
    sign_in_as @owner
    post map_offer_versions_path(@map), as: :json
    assert_response :unprocessable_entity, "nothing to version before the first save"

    patch map_offer_path(@map), params: { offer: { inputs:, lock_version: 0 } }, as: :json
    post map_offer_versions_path(@map), params: { note: "Premier envoi" }, as: :json
    assert_response :created
    assert_equal "V1", response.parsed_body["version"]["label"]
    v1_total = response.parsed_body["version"]["totalTvac"]

    lock = @map.reload.offer.lock_version
    patch map_offer_path(@map), params: { offer: { inputs: inputs.merge(settings: { designers: 1 }), lock_version: lock } }, as: :json
    post map_offer_versions_path(@map), as: :json
    assert_equal "V2", response.parsed_body["version"]["label"]
    assert_operator response.parsed_body["version"]["totalTvac"], :<, v1_total

    patch map_offer_version_path(@map, 1), params: { version: { status: "sent" } }, as: :json
    assert_response :success
    assert_equal "sent", @map.offer.versions.find_by(number: 1).status

    post restore_map_offer_version_path(@map, 1), as: :json
    assert_response :success
    assert_equal 2, response.parsed_body["offer"]["inputs"]["settings"]["designers"]

    get map_offer_version_path(@map, 1), headers: inertia_headers
    assert_equal "maps/offers/version", response.parsed_body["component"]
    assert_equal v1_total, response.parsed_body["props"]["version"]["result"]["totals"]["total_tvac"]
  end
end
