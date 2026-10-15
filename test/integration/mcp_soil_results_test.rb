require "test_helper"
require "test_helpers/mcp_test_helper"

# The user's AI reads the lab reports of a soil sample and proposes the
# values, which a human keeps or refuses one by one.
class McpSoilResultsTest < ActionDispatch::IntegrationTest
  include McpTestHelper

  setup do
    @map = maps(:ahinvaux)
    @owner = personal_token(users(:michael))
    @viewer = personal_token(users(:alice))
    @sample = @map.soil_samples.create!(label: "Verger", results: { "ph_water" => 6.0 }, created_by: users(:michael))
    @standard = attach("analyse_sol.pdf", "analyse-standard.pdf")
    @metals = attach("rapport_scanne.pdf", "metaux-lourds.pdf")
  end

  def attach(fixture, filename)
    @sample.lab_reports.attach(io: file_fixture(fixture).open, filename:, content_type: "application/pdf")
    @sample.lab_reports.reload.find { |r| r.filename.to_s == filename }
  end

  def propose(token = @owner, **overrides)
    call_tool(token, "propose_soil_results", {
      map_id: @map.id, sample_id: @sample.id, report_ids: [ @standard.id, @metals.id ],
      results: [
        { key: "ph_water", value: 6.4, note: "Page 1, « pH eau »." },
        { key: "organic_matter_pct", value: 3.1 },
        { key: "p_mg_100g", value: 2500 }
      ],
      other_results: [ { name: "Plomb (Pb)", value: "< 5", unit: "mg/kg MS" } ],
      lab: "Centre de Michamps", sampled_on: "2026-03-02",
      rationale: "Lu dans l'analyse standard ; le plomb vient de l'analyse des métaux lourds."
    }.merge(overrides))
  end

  test "get_map counts the sampling points and their reports" do
    data, error = call_tool(@viewer, "get_map", { map_id: @map.id })
    refute error
    assert_equal({ "total" => 1, "analysed" => 1, "with_reports" => 1, "drafts_pending" => 0 }, data["soil_samples"])
  end

  test "get_soil_samples lists the points, their reports and the typed fields" do
    data, error = call_tool(@viewer, "get_soil_samples", { map_id: @map.id })
    refute error
    sample = data["samples"].sole
    assert_equal [ "Verger", { "ph_water" => 6.0 } ], sample.values_at("label", "results")
    assert_equal %w[analyse-standard.pdf metaux-lourds.pdf], sample["reports"].map { |r| r["filename"] }
    assert_includes data["result_fields"], { "key" => "p_mg_100g", "name" => "Phosphore (P)", "unit" => "mg/100 g", "min" => 0, "max" => 1000 }
    assert_match(/P2O5 × 0,436/, data["units_note"])
    assert_equal "get_soil_samples", AiAction.last.tool
  end

  test "get_soil_report gives the text of a report" do
    data, error = call_tool(@viewer, "get_soil_report", { map_id: @map.id, sample_id: @sample.id, report_id: @standard.id })
    refute error
    assert_equal "text", data["format"]
    assert_match(/pH eau : 6.4/, data["text"])
    assert_equal 1, data["pages"]
  end

  test "get_soil_report shows the pages of a scan as images" do
    skip "Ghostscript is not installed" unless Ghostscript.available?
    body = mcp_request(@viewer, "tools/call", { name: "get_soil_report", arguments: { map_id: @map.id, sample_id: @sample.id, report_id: @metals.id } })
    result = body["result"]
    refute result["isError"]
    assert_equal [ "images", 1, 1 ], result["structuredContent"].values_at("format", "pages", "images")
    image = result["content"].find { |c| c["type"] == "image" }
    assert Base64.strict_decode64(image["data"]).start_with?("\xFF\xD8".b), "a JPEG"
  end

  test "get_soil_report says a scan cannot be read when the server cannot draw it" do
    stubbing(Ghostscript, :available?, false) do
      data, error = call_tool(@viewer, "get_soil_report", { map_id: @map.id, sample_id: @sample.id, report_id: @metals.id })
      refute error
      assert_equal "unreadable", data["format"]
      assert_match(/scan/, data["reason"])
    end
  end

  test "a report of another sample is not found" do
    other = @map.soil_samples.create!(label: "Potager")
    text, error = call_tool(@viewer, "get_soil_report", { map_id: @map.id, sample_id: other.id, report_id: @standard.id })
    assert error
    assert_match(/introuvable/, text)
  end

  test "propose_soil_results waits for review, and nothing reaches the results" do
    data, error = propose
    refute error
    assert_equal({ "results" => 2, "other_results" => 1, "fields" => %w[lab sampled_on] }, data["proposed"])
    assert_equal "p_mg_100g", data["rejected"].sole["key"]
    assert_equal [ { "key" => "ph_water", "current" => 6.0, "proposed" => 6.4 } ], data["replaces"]
    @sample.reload
    assert_equal({ "ph_water" => 6.0 }, @sample.results)
    assert_nil @sample.lab
    draft = @sample.draft.as_inertia
    assert_equal %w[analyse-standard.pdf metaux-lourds.pdf], draft[:reports]
    assert_equal "Page 1, « pH eau ».", draft[:results].first[:note]
    assert_equal 5, AiAction.last.result["created"]
  end

  test "a value already entered is not proposed again, and a new proposal replaces the old one" do
    propose
    data, error = call_tool(@owner, "propose_soil_results", { map_id: @map.id, sample_id: @sample.id, results: [ { key: "ph_water", value: 6.0 }, { key: "clay_pct", value: 18 } ], rationale: "Seconde lecture du rapport." })
    refute error
    assert_equal [ "ph_water" ], data["unchanged"]
    assert_equal [ "result:clay_pct" ], @sample.reload.draft.items
  end

  test "nothing new to propose is an error" do
    text, error = call_tool(@owner, "propose_soil_results", { map_id: @map.id, sample_id: @sample.id, results: [ { key: "ph_water", value: 6.0 } ], rationale: "Seconde lecture du rapport." })
    assert error
    assert_match(/déjà saisies/, text)
  end

  test "a viewer cannot propose" do
    text, error = propose(@viewer)
    assert error
    assert_match(/éditeurs/, text)
    assert_nil @sample.reload.results_draft
  end
end
