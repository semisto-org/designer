require "test_helper"
require "test_helpers/mcp_test_helper"

# propose_bubbles: the first tracing sheet of a design, intentions linked to
# the project's functions, laid as drafts.
class McpBubblesTest < ActionDispatch::IntegrationTest
  setup do
    @map = maps(:ahinvaux)
    @owner = personal_token(users(:michael))
    @map.update!(project: ProjectSheet.merge({}, { "analysis" => {
      "holder_functions" => [ { "name" => "Se retrouver", "id" => "fmeet" } ],
      "place_functions" => [ { "name" => "Retenir l'eau", "id" => "fwater" } ]
    } }).to_h)
  end

  def shape(lng) = { type: "Polygon", coordinates: [ [ [ lng, 50.3410 ], [ lng + 0.0004, 50.3410 ], [ lng + 0.0004, 50.3413 ], [ lng, 50.3413 ], [ lng, 50.3410 ] ] ] }
  def propose(bubbles) = call_tool(@owner, "propose_bubbles", { map_id: @map.id, summary: "Bulles de départ", bubbles: })

  test "lays named, rounded bubbles linked to the project's functions as drafts" do
    data, error = propose([
      { name: "Se retrouver le soir", geometry: shape(4.9050), serves: [ "fmeet" ], rationale: "Près de la maison, à l'abri du vent d'ouest." },
      { name: "Garder l'eau en bas", geometry: shape(4.9058), serves: [ "fwater" ], rationale: "Le bas du terrain où l'eau stagne en hiver." }
    ])
    refute error, data
    bubbles = @map.features.where(kind: "bubble").order(:id)
    assert_equal [ "drawings" ], bubbles.map(&:layer).uniq
    assert_equal %w[draft draft], bubbles.map(&:status)
    assert_equal [ [ "fmeet" ], [ "fwater" ] ], bubbles.map { _1.properties["serves"] }
    assert bubbles.all? { _1.properties["rounded"] == true && _1.style["color"].present? }
    refute_equal bubbles.first.style["color"], bubbles.second.style["color"]
    assert_equal({ "created" => 2, "feature_ids" => bubbles.map(&:id) }, AiAction.where(tool: "propose_bubbles").last.result)
  end

  test "refuses a function the analysis does not have" do
    text, error = propose([ { name: "Cueillir", geometry: shape(4.9050), serves: [ "fnope" ], rationale: "Au soleil, près de la cuisine." } ])
    assert error
    assert_match "fnope", text.to_s
    assert_equal 0, @map.features.where(kind: "bubble").count
  end
end
