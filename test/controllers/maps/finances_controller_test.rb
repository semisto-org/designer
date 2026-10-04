require "test_helper"

class Maps::FinancesControllerTest < ActionDispatch::IntegrationTest
  setup do
    @map = maps(:ahinvaux)
    @map.update_columns(area_m2: 37_000.0)
  end

  def inputs
    {
      settings: { startYear: 2027, labourCostPerHour: 15 },
      species: [ { name: "Pommier", quantity: 100, unitPrice: 10, firstHarvestAge: 3, fullProductionAge: 5,
                   yieldKgPerPlant: 10, pickingRateKgPerHour: 20, directSharePct: 100, directPrice: 4 } ]
    }
  end

  test "page with a prefilled plan, not saved until the first change" do
    sign_in_as users(:michael)
    assert_no_difference -> { FinancialPlan.count } do
      get map_finances_path(@map), headers: inertia_headers
    end
    assert_response :success
    page = response.parsed_body
    assert_equal "maps/finances/show", page["component"]
    props = page["props"]
    assert_equal false, props["plan"]["persisted"]
    assert_equal 3.7, props["plan"]["inputs"]["settings"]["areaHa"]
    assert_equal 20, props["result"]["years"].size
    assert props["canEdit"]
  end

  test "owner saves the plan and gets the computed result" do
    sign_in_as users(:michael)
    patch map_finances_path(@map), params: { plan: { inputs:, lock_version: 0 } }, as: :json
    assert_response :success
    body = response.parsed_body
    assert body["plan"]["persisted"]
    assert_equal 2027, body["plan"]["inputs"]["settings"]["startYear"]
    assert_equal 3, body["result"]["indicators"]["breakEvenYear"]
    assert_equal users(:michael), @map.reload.financial_plan.updated_by
  end

  test "stale saves are refused with the latest version" do
    sign_in_as users(:michael)
    patch map_finances_path(@map), params: { plan: { inputs:, lock_version: 0 } }, as: :json # created
    patch map_finances_path(@map), params: { plan: { inputs:, lock_version: 0 } }, as: :json # updated, now 1
    assert_response :success
    patch map_finances_path(@map), params: { plan: { inputs: { settings: { startYear: 2031 } }, lock_version: 0 } }, as: :json
    assert_response :conflict
    assert_equal 2027, response.parsed_body["plan"]["inputs"]["settings"]["startYear"]
    assert_equal 1, response.parsed_body["plan"]["lockVersion"]
  end

  test "viewers read but cannot save or sync" do
    sign_in_as users(:alice)
    get map_finances_path(@map), headers: inertia_headers
    assert_response :success
    assert_equal false, response.parsed_body["props"]["canEdit"]
    patch map_finances_path(@map), params: { plan: { inputs: } }, as: :json
    assert_response :forbidden
    post sync_map_finances_path(@map), as: :json
    assert_response :forbidden
  end

  test "strangers see nothing" do
    sign_in_as users(:bob)
    get map_finances_path(@map), as: :json
    assert_response :not_found
  end

  test "summary for the editor panel" do
    sign_in_as users(:michael)
    get map_finances_path(@map), as: :json
    assert_response :success
    assert_equal false, response.parsed_body["plan"]["persisted"]
    assert_equal 1, response.parsed_body["summary"]["warningsCount"]
  end

  test "sync brings the plants placed on the map" do
    @map.features.create!(layer: "plants", kind: "plant", geometry: { "type" => "Point", "coordinates" => [ 4.905, 50.34 ] },
      properties: { "species_id" => plant_species(:apple).id })
    sign_in_as users(:michael)
    post sync_map_finances_path(@map), as: :json
    assert_response :success
    assert_equal({ "added" => 0, "updated" => 0 }, response.parsed_body["sync"], "already prefilled when the plan was built")
    assert_equal [ "Pommier" ], @map.reload.financial_plan.inputs["species"].map { _1["name"] }
  end

  test "CSV and XLSX exports" do
    sign_in_as users(:alice)
    get map_finances_path(@map, format: :csv)
    assert_response :success
    assert_equal "text/csv; charset=utf-8", response.media_type + "; charset=utf-8"
    assert_includes response.headers["Content-Disposition"], "plan-financier-domaine-d-ahinvaux.csv"
    assert response.body.include?("Trésorerie cumulée")

    get map_finances_path(@map, format: :xlsx)
    assert_response :success
    assert_equal "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", response.media_type
    assert response.body.start_with?("PK")
  end
end
