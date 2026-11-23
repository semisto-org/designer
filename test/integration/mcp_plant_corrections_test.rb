require "test_helper"
require "test_helpers/mcp_test_helper"

# The person's AI suggests corrections of the shared catalogue; nothing
# changes before a catalogue reviewer accepts them.
class McpPlantCorrectionsTest < ActionDispatch::IntegrationTest
  setup do
    @token = personal_token(users(:alice))
    @alder = plant_species(:alder)
  end

  test "suggest_plant_corrections leaves suggestions for a reviewer, one by one" do
    data, error = call_tool(@token, "suggest_plant_corrections", { corrections: [
      { plant_id: @alder.id, field: "spread_max_m", value: 10, note: "Wikipédia donne 10 m", url: "https://fr.wikipedia.org/wiki/Aulne_glutineux" },
      { plant_id: @alder.id, field: "strata", value: "arbre", note: "Mauvaise clé" },
      { plant_id: 999_999, field: "other", note: "Introuvable" }
    ] })
    refute error, data
    ok, bad, missing = data["corrections"]
    assert_equal [ 8.0, 10.0, "pending" ], ok.values_at("current", "proposed", "status")
    assert bad["error"]
    assert missing["error"]
    assert_equal 8, @alder.reload.spread_max_m.to_i, "the catalogue waits for a reviewer"
    correction = PlantCorrection.sole
    assert_equal [ "ai", users(:alice) ], [ correction.origin, correction.user ]
    assert_equal({ "sent" => 1 }, AiAction.last.result)
  end

  test "needs the drafts access" do
    message, error = call_tool(personal_token(users(:alice), access: "read"), "suggest_plant_corrections", { corrections: [
      { plant_id: @alder.id, field: "other", note: "Une remarque" }
    ] })
    assert error
    assert message.present?
    assert_equal 0, PlantCorrection.count
  end
end
