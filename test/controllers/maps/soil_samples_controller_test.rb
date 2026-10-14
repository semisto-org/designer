require "test_helper"
require_relative "../../test_helpers/soil_photos_helper"

class Maps::SoilSamplesControllerTest < ActionDispatch::IntegrationTest
  include SoilPhotosHelper

  setup { @map = maps(:ahinvaux) }

  def create_sample(**attrs) = @map.soil_samples.create!({ label: "Verger", created_by: users(:michael) }.merge(attrs))

  RESULTS = { ph_water: "5,2", organic_matter_pct: 4.1, c_n_ratio: 14, sand_pct: 20, silt_pct: 65, clay_pct: 15 }.freeze

  test "a signed-out visitor is sent to sign in, someone outside the map gets nothing" do
    get map_soil_samples_path(@map), as: :json
    assert_redirected_to new_session_path
    sign_in_as users(:bob)
    get map_soil_samples_path(@map), as: :json
    assert_response :not_found
  end

  test "a viewer sees the samples, never writes" do
    sample = create_sample(results: RESULTS)
    sign_in_as users(:alice)
    get map_soil_samples_path(@map), as: :json
    assert_response :success
    assert_equal [ sample.id ], response.parsed_body["samples"].map { |s| s["id"] }

    post map_soil_samples_path(@map), params: { soil_sample: { label: "Non" } }, as: :json
    assert_response :forbidden
    patch map_soil_sample_path(@map, sample), params: { soil_sample: { label: "Non" } }, as: :json
    assert_response :forbidden
    delete map_soil_sample_path(@map, sample), as: :json
    assert_response :forbidden
    post suggestions_map_soil_samples_path(@map), as: :json
    assert_response :forbidden
    assert_equal 1, @map.soil_samples.count
  end

  test "an editor places a point on the map" do
    sign_in_as users(:michael)
    post map_soil_samples_path(@map), params: { soil_sample: { label: "Verger nord", lng: 4.907, lat: 50.341, depth_from_cm: 20, depth_to_cm: 40 } }, as: :json
    assert_response :created
    body = response.parsed_body
    assert_equal [ 4.907, 50.341 ], [ body["lng"], body["lat"] ]
    assert_equal [ 20, 40 ], [ body["depthFromCm"], body["depthToCm"] ]
    assert_equal "planned", body["status"]
    assert_equal users(:michael), SoilSample.last.created_by
  end

  test "an editor enters the lab results, the sampling date and the lab" do
    sample = create_sample(location: [ 4.9, 50.34 ])
    sign_in_as users(:michael)
    patch map_soil_sample_path(@map, sample), params: { soil_sample: {
      status: "sampled", sampled_on: "2026-10-02", lab: "Laboratoire provincial", lab_reference: "2026-1234", results: RESULTS
    } }, as: :json
    assert_response :success
    sample.reload
    assert_equal "sampled", sample.status
    assert_equal Date.new(2026, 10, 2), sample.sampled_on
    assert_equal 5.2, sample.results["ph_water"]
    assert_equal 65.0, sample.results["silt_pct"]
  end

  test "bad figures come back as French errors" do
    sample = create_sample
    sign_in_as users(:michael)
    patch map_soil_sample_path(@map, sample), params: { soil_sample: { results: { ph_water: "99" } } }, as: :json
    assert_response :unprocessable_entity
    assert_match(/« pH eau » doit être compris entre 0 et 14\./, response.parsed_body["message"])
  end

  test "an editor deletes a point" do
    sample = create_sample
    sign_in_as users(:michael)
    assert_difference -> { @map.soil_samples.count }, -1 do
      delete map_soil_sample_path(@map, sample), as: :json
    end
    assert_response :no_content
  end

  test "with analyses in the plan, the reading comes with the samples" do
    create_sample(results: RESULTS)
    sign_in_as users(:alice)
    get map_soil_samples_path(@map), as: :json
    body = response.parsed_body
    assert body["analyses"]
    reading = body["samples"].first["interpretation"]
    assert_equal %w[low ok high], reading["parameters"].map { |p| p["band"] }
    assert_equal "silt_loam", reading["texture"]["key"]
    assert_equal({ "low_below" => 6.0, "high_above" => 7.5 }, body["bands"]["ph_water"])
    assert_includes body["provenance"], "REQUASUD"
  end

  test "without analyses in the plan, the measures stay but the reading is withheld" do
    create_sample(results: RESULTS)
    sign_in_as users(:alice)
    with_billing_enabled do
      get map_soil_samples_path(@map), as: :json
    end
    body = response.parsed_body
    assert_not body["analyses"]
    assert_nil body["bands"]
    sample = body["samples"].first
    assert_equal 5.2, sample["results"]["ph_water"]
    assert_nil sample["interpretation"]
  end

  test "a paid owner unlocks the reading for every member of the map" do
    create_sample(results: RESULTS)
    sign_in_as users(:alice)
    with_plan("yearly") do
      get map_soil_samples_path(@map), as: :json
    end
    assert response.parsed_body["analyses"]
    assert response.parsed_body["samples"].first["interpretation"]
  end

  test "creating a sample on a free plan does not leak the reading either" do
    sign_in_as users(:michael)
    with_billing_enabled do
      post map_soil_samples_path(@map), params: { soil_sample: { label: "A", results: RESULTS } }, as: :json
    end
    assert_response :created
    assert_nil response.parsed_body["interpretation"]
  end

  test "suggestions: points spread over the boundary, away from buildings, nothing saved" do
    @map.features.create!(layer: "existing", kind: "building", name: "Ferme", geometry: GeoJsonGeometry::FACTORY.parse_wkt("POLYGON((4.9045 50.3405, 4.9055 50.3405, 4.9055 50.3415, 4.9045 50.3415, 4.9045 50.3405))"))
    sign_in_as users(:michael)
    assert_no_difference -> { SoilSample.count } do
      post suggestions_map_soil_samples_path(@map), params: { count: 6 }, as: :json
    end
    assert_response :success
    body = response.parsed_body
    assert_equal 6, body["points"].size
    assert_equal [ 1, 2, 3, 4, 5, 6 ], body["points"].map { |p| p["rank"] }
    assert_equal 5.0, body["edgeMargin"]
    boundary = @map.boundary
    body["points"].each do |p|
      point = GeoJsonGeometry::FACTORY.point(p["lng"], p["lat"])
      assert boundary.contains?(point)
      assert_not (4.9045..4.9055).cover?(p["lng"]) && (50.3405..50.3415).cover?(p["lat"]), "#{p} is on the building"
    end
  end

  test "suggestions need a boundary" do
    map = Map.create!(name: "Sans contour", owner: users(:michael), region: regions(:wallonia))
    sign_in_as users(:michael)
    post suggestions_map_soil_samples_path(map), as: :json
    assert_response :unprocessable_entity
    assert_match(/Dessine d'abord le contour/, response.parsed_body["message"])
  end

  test "suggestions stay free on a free plan" do
    sign_in_as users(:michael)
    with_billing_enabled do
      post suggestions_map_soil_samples_path(@map), params: { count: 3 }, as: :json
    end
    assert_response :success
  end

  test "accepting suggestions creates one planned point each, numbered on" do
    create_sample(label: "Point 1")
    sign_in_as users(:michael)
    assert_difference -> { @map.soil_samples.count }, 2 do
      post bulk_map_soil_samples_path(@map), params: { points: [ { lng: 4.906, lat: 50.340 }, { lng: 4.909, lat: 50.342 } ] }, as: :json
    end
    assert_response :created
    samples = response.parsed_body["samples"]
    assert_equal [ "Point 2", "Point 3" ], samples.map { |s| s["label"] }
    assert_equal [ "suggested" ], samples.map { |s| s["source"] }.uniq
    post bulk_map_soil_samples_path(@map), params: { points: [] }, as: :json
    assert_response :unprocessable_entity
  end

  test "lab reports: attach several PDFs, read each through a short-lived link, remove one" do
    sample = create_sample
    sign_in_as users(:michael)
    post map_soil_sample_reports_path(@map, sample),
         params: { soil_sample: { lab_reports: [ upload("rapport_labo.pdf", "application/pdf"), upload("analyse_sol.pdf", "application/pdf") ] } },
         headers: json_headers
    assert_response :created
    reports = response.parsed_body["reports"]
    assert_equal %w[rapport_labo.pdf analyse_sol.pdf], reports.map { |r| r["filename"] }

    post map_soil_sample_reports_path(@map, sample), params: { soil_sample: { lab_reports: [ upload("analyse_sol.pdf", "application/pdf") ] } }, headers: json_headers
    assert_equal 3, response.parsed_body["reports"].size

    sign_in_as users(:alice)
    get map_soil_sample_report_path(@map, sample, reports.first["id"])
    assert_response :redirect
    assert_match %r{/rails/active_storage/disk/}, response.location

    sign_in_as users(:michael)
    delete map_soil_sample_report_path(@map, sample, reports.first["id"]), as: :json
    assert_response :success
    assert_equal 2, response.parsed_body["reports"].size
    assert_not_includes response.parsed_body["reports"].map { |r| r["id"] }, reports.first["id"]
  end

  test "lab reports: only PDFs, all or nothing, and only editors attach" do
    sample = create_sample
    sign_in_as users(:michael)
    post map_soil_sample_reports_path(@map, sample),
         params: { soil_sample: { lab_reports: [ upload("rapport_labo.pdf", "application/pdf"), upload("terrain.jpg", "image/jpeg") ] } },
         headers: json_headers
    assert_response :unprocessable_entity
    assert_match(/n'est pas un PDF/, response.parsed_body["message"])
    assert_not sample.reload.lab_reports.attached?

    sign_in_as users(:alice)
    post map_soil_sample_reports_path(@map, sample), params: { soil_sample: { lab_reports: [ upload("rapport_labo.pdf", "application/pdf") ] } }, headers: json_headers
    assert_response :forbidden
  end

  test "lab reports: at most ten per sample" do
    sample = create_sample
    10.times { |i| sample.lab_reports.attach(io: file_fixture("analyse_sol.pdf").open, filename: "analyse-#{i}.pdf", content_type: "application/pdf") }
    sign_in_as users(:michael)
    post map_soil_sample_reports_path(@map, sample), params: { soil_sample: { lab_reports: [ upload("rapport_labo.pdf", "application/pdf") ] } }, headers: json_headers
    assert_response :unprocessable_entity
    assert_match(/10 rapports au plus/, response.parsed_body["message"])
    assert_equal 10, sample.reload.lab_reports.count
  end

  test "other lab values are saved as written, and an emptied list clears them" do
    sample = create_sample
    sign_in_as users(:michael)
    patch map_soil_sample_path(@map, sample), params: { soil_sample: { other_results: [ { name: "Cadmium (Cd)", value: "< 0,2", unit: "mg/kg MS" } ] } }, as: :json
    assert_response :success
    assert_equal [ { "name" => "Cadmium (Cd)", "value" => "< 0,2", "unit" => "mg/kg MS" } ], response.parsed_body["otherResults"]
    patch map_soil_sample_path(@map, sample), params: { soil_sample: { other_results: [] } }, as: :json
    assert_equal [], sample.reload.other_results
  end

  test "lab report: one no longer attached is a clear 404" do
    sample = create_sample
    sign_in_as users(:alice)
    get map_soil_sample_report_path(@map, sample, 999_999), headers: json_headers
    assert_response :not_found
    assert_equal "Ce rapport n'est plus joint à ce point.", response.parsed_body["message"]
  end

  test "values proposed by the AI: kept one by one, refused, and only by editors" do
    sample = create_sample(results: { ph_water: 6.0 })
    sample.update!(results_draft: {
      "results" => [ { "key" => "ph_water", "value" => 6.4, "note" => "page 1" }, { "key" => "organic_matter_pct", "value" => 3.1 } ],
      "other_results" => [ { "name" => "Plomb (Pb)", "value" => "23", "unit" => "mg/kg MS" } ],
      "lab" => "Centre de Michamps", "rationale" => "Lu dans l'analyse standard et l'analyse métaux lourds."
    })
    sign_in_as users(:alice)
    patch map_soil_sample_draft_path(@map, sample), params: { keep: [ "result:ph_water" ] }, as: :json
    assert_response :forbidden

    sign_in_as users(:michael)
    get map_soil_samples_path(@map), as: :json
    draft = response.parsed_body["samples"].sole["draft"]
    assert_equal [ [ "ph_water", 6.4, 6.0 ], [ "organic_matter_pct", 3.1, nil ] ], draft["results"].map { |r| r.values_at("key", "value", "current") }
    assert_equal "Centre de Michamps", draft["lab"]

    patch map_soil_sample_draft_path(@map, sample), params: { keep: [ "result:ph_water", "other:Plomb (Pb)", "lab" ], refuse: [ "result:organic_matter_pct" ] }, as: :json
    assert_response :success
    body = response.parsed_body
    assert_nil body["draft"]
    sample.reload
    assert_equal({ "ph_water" => 6.4 }, sample.results)
    assert_equal [ { "name" => "Plomb (Pb)", "value" => "23", "unit" => "mg/kg MS" } ], sample.other_results
    assert_equal [ "Centre de Michamps", "sampled" ], [ sample.lab, sample.status ]
  end

  test "values proposed by the AI: a kept value still meets the sample's rules" do
    sample = create_sample(results: { sand_pct: 50, silt_pct: 40 })
    sample.update!(results_draft: { "results" => [ { "key" => "clay_pct", "value" => 40 } ], "rationale" => "Texture du rapport." })
    sign_in_as users(:michael)
    patch map_soil_sample_draft_path(@map, sample), params: { keep: [ "result:clay_pct" ] }, as: :json
    assert_response :unprocessable_entity
    assert_match(/100 %/, response.parsed_body["message"])
    assert sample.reload.draft.pending?

    delete map_soil_sample_draft_path(@map, sample), as: :json
    assert_response :success
    assert_nil sample.reload.results_draft
  end

  test "samples of another map cannot be reached through this one" do
    other = Map.create!(name: "Autre", owner: users(:michael), region: regions(:wallonia))
    foreign = other.soil_samples.create!(label: "Ailleurs")
    sign_in_as users(:michael)
    patch map_soil_sample_path(@map, foreign), params: { soil_sample: { label: "x" } }, as: :json
    assert_response :not_found
  end
end
