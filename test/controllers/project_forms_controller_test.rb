require "test_helper"
require_relative "../test_helpers/billing_test_helper"

class ProjectFormsControllerTest < ActionDispatch::IntegrationTest
  include BillingTestHelper
  include ActionMailer::TestHelper

  setup do
    @map = maps(:ahinvaux)
    @map.update!(project: { "budget" => { "initial" => "under_500" } }, address: "Rue du Moulin 1, Yvoir")
    @link = @map.create_project_sheet_link!(created_by: users(:michael))
  end

  test "opens the form without an account, with the sheet and nothing of the map" do
    get project_form_path(@link.token), headers: inertia_headers
    assert_response :success
    body = response.parsed_body
    assert_equal "project_forms/show", body["component"]
    props = body["props"]
    assert_equal @map.name, props["mapName"]
    assert_equal({ "budget" => { "initial" => "under_500" } }, props["project"])
    assert_equal 10, props["schema"]["sections"].size
    assert_equal true, props["canEdit"]
    assert_nil props["currentUser"]
    refute_includes response.body, "Rue du Moulin"
    refute props.key?("map")
    assert_equal "noindex, nofollow", response.headers["X-Robots-Tag"]
    assert @link.reload.opened_at.present?
  end

  test "autosave merges fields into the map's sheet" do
    patch project_form_path(@link.token), params: { project: { budget: { yearly: "under_100" } } }, as: :json
    assert_response :success
    assert_equal({ "initial" => "under_500", "yearly" => "under_100" }, @map.reload.project["budget"])
    assert_equal 67, response.parsed_body.dig("progress", "sections", "budget", "percent")
  end

  test "invalid answers are refused" do
    patch project_form_path(@link.token), params: { project: { budget: { initial: "a_fortune" } } }, as: :json
    assert_response :unprocessable_entity
    assert_equal "under_500", @map.reload.project.dig("budget", "initial")
  end

  test "« J'ai terminé » records it and tells the owner" do
    assert_enqueued_emails 1 do
      post submit_project_form_path(@link.token), as: :json
    end
    assert_response :success
    assert @link.reload.submitted_at.present?
  end

  test "a switched-off, reset or unknown link no longer works" do
    old = @link.token
    @link.reset!
    get project_form_path(old), headers: inertia_headers
    assert_response :gone
    assert_equal "project_forms/gone", response.parsed_body["component"]
    patch project_form_path(old), params: { project: { budget: { yearly: "under_100" } } }, as: :json
    assert_response :gone

    @link.disable!
    get project_form_path(@link.token), as: :json
    assert_response :gone
    post submit_project_form_path(@link.token), as: :json
    assert_response :gone

    get project_form_path("x" * 32), as: :json
    assert_response :gone
    assert_nil @map.reload.project["budget"]["yearly"]
  end

  test "an archived map closes its link" do
    @map.update!(archived_at: Time.current)
    get project_form_path(@link.token), as: :json
    assert_response :gone
  end

  test "a map that is read-only by plan cannot be changed from the link" do
    owner = users(:bob)
    Map.create!(name: "Première", owner:, region: regions(:wallonia), created_at: 2.months.ago)
    locked = Map.create!(name: "Deuxième", owner:, region: regions(:wallonia), created_at: 1.month.ago)
    link = locked.create_project_sheet_link!(created_by: owner)
    with_billing do
      get project_form_path(link.token), headers: inertia_headers
      assert_equal false, response.parsed_body.dig("props", "canEdit")
      patch project_form_path(link.token), params: { project: { budget: { yearly: "under_100" } } }, as: :json
      assert_response :forbidden
      post submit_project_form_path(link.token), as: :json
      assert_response :forbidden
    end
    assert_equal({}, locked.reload.project)
  end
end
