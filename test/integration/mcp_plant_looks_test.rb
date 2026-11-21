require "test_helper"
require "test_helpers/mcp_test_helper"

# A catalogue reviewer's AI fills the look of species for the 3D view, each
# value citing its page and landing « to verify »; what is there stays.
class McpPlantLooksTest < ActionDispatch::IntegrationTest
  setup do
    users(:michael).update!(catalogue_reviewer: true)
    @reviewer = personal_token(users(:michael))
    @alder = plant_species(:alder)
    @alder.update!(bark_color: "grey")
  end

  test "record_plant_looks fills empty traits with their page, keeps the values already there" do
    data, error = call_tool(@reviewer, "record_plant_looks", { plants: [
      { plant_id: @alder.id, values: { bark_color: "dark", fruit_color: "brown", autumn_color: "none" },
        source: "Wikipedia", url: "https://fr.wikipedia.org/wiki/Aulne_glutineux" }
    ] })
    refute error, data
    result = data["plants"].first
    assert_equal %w[fruit_color autumn_color].sort, result["written"].sort
    assert_equal({ "bark_color" => { "current" => "grey", "proposed" => "dark" } }, result["kept"])
    @alder.reload
    assert_equal [ "brown", "none", "grey" ], [ @alder.fruit_color, @alder.autumn_color, @alder.bark_color ]
    row = @alder.provenance_for("fruit_color")
    assert_equal [ "ai", "wikipedia", "to_verify", "https://fr.wikipedia.org/wiki/Aulne_glutineux" ], [ row.source, row.upstream_source, row.status, row.url ]
    assert_equal({ "written" => 2 }, AiAction.last.result)

    # Its own earlier reading may be corrected.
    data, = call_tool(@reviewer, "record_plant_looks", { plants: [
      { plant_id: @alder.id, values: { fruit_color: "black" }, source: "wikipedia", url: "https://fr.wikipedia.org/wiki/Alnus" }
    ] })
    assert_equal [ "fruit_color" ], data["plants"].first["written"]
  end

  test "PFAF is never a source, a page is required, and only catalogue reviewers write" do
    data, = call_tool(@reviewer, "record_plant_looks", { plants: [
      { plant_id: @alder.id, values: { fruit_color: "brown" }, source: "pfaf", url: "https://pfaf.org/user/Plant.aspx" },
      { plant_id: @alder.id, values: { fruit_color: "brown" }, source: "wikipedia", url: "fr.wikipedia.org" },
      { plant_id: 999_999, values: { fruit_color: "brown" }, source: "wikipedia", url: "https://fr.wikipedia.org" }
    ] })
    assert_equal 3, data["plants"].count { _1["error"] }, data.inspect
    assert_nil @alder.reload.fruit_color

    message, error = call_tool(personal_token(users(:alice)), "record_plant_looks", { plants: [
      { plant_id: @alder.id, values: { fruit_color: "brown" }, source: "wikipedia", url: "https://fr.wikipedia.org" }
    ] })
    assert error
    assert_match "relecteurs", message
  end
end
