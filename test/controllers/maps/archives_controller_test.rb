require "test_helper"
require_relative "../../test_helpers/billing_test_helper"

class Maps::ArchivesControllerTest < ActionDispatch::IntegrationTest
  include BillingTestHelper

  setup do
    @owner = users(:michael)
    @map = maps(:ahinvaux)
  end

  test "the owner archives a map: it stays readable but nobody edits it, and it stops counting" do
    sign_in_as @owner
    with_billing do
      post map_archive_path(@map)
      assert_redirected_to maps_path
      assert @map.reload.archived?

      get map_path(@map)
      assert_response :success
      patch map_path(@map), params: { map: { name: "Autre nom" } }, as: :json
      assert_response :forbidden
      assert_equal "archived", response.parsed_body["code"]
      assert_not_includes @owner.billed_maps, @map
      assert_includes @owner.billed_maps(archived: true), @map
    end
  end

  test "« Mes cartes » lists the archived maps, and unarchiving waits for room in the plan" do
    @map.archive!
    sign_in_as @owner
    with_billing do
      get maps_path, headers: inertia_headers
      archived = response.parsed_body["props"]["archivedMaps"]
      assert_equal [ @map.id ], archived.map { _1["id"] }

      # The free plan has one active map: fill it, then try to bring the archived one back.
      @owner.owned_maps.where.not(id: @map.id).where(archived_at: nil).update_all(archived_at: Time.current)
      Map.create!(name: "Jardin actif", owner: @owner, boundary: @map.geometry_geojson(:boundary))
      refute @map.reload.unarchivable?
      delete map_archive_path(@map)
      assert @map.reload.archived?

      @owner.plan_grants.create!(plan_key: "yearly", starts_at: 1.day.ago, ends_at: 1.year.from_now)
      delete map_archive_path(@map)
      assert_redirected_to map_path(@map)
      refute @map.reload.archived?
    end
  end

  test "only the owner archives" do
    sign_in_as users(:alice)
    post map_archive_path(@map)
    refute @map.reload.archived?
  end
end
