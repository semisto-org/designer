require "test_helper"
require "test_helpers/mcp_test_helper"

# The user's AI sees the map's « Présenter » sequences, to help prepare what
# to say at each step, and gives the link that opens the panel.
class McpPresentationsTest < ActionDispatch::IntegrationTest
  test "get_map lists the presentations, their steps and the panel link" do
    map = maps(:ahinvaux)
    template = PresentationTemplate.find("pre_design")
    map.presentations.create!(name: template.name, template_key: template.key, steps: template.steps.first(2))
    map.presentations.first.update!(steps: map.presentations.first.steps.map.with_index { |s, i| i == 1 ? s.merge("shown" => false) : s })

    data, error = call_tool(personal_token(users(:alice)), "get_map", { map_id: map.id })
    refute error, data
    presentations = data["presentations"]
    assert_match %r{/maps/#{map.id}\?panel=present\z}, presentations["panel_url"]
    assert_equal [ { "key" => "pre_design", "name" => "Pré-design" } ], presentations["templates"]
    steps = presentations["list"].sole["steps"]
    assert_equal [ "Votre jardin-forêt", "Votre projet" ], steps.map { _1["title"] }
    assert_equal [ true, false ], steps.map { _1["shown"] }
    assert_equal({ "text" => "", "format" => "markdown" }, steps.first["slide"])
    assert_equal "project", steps.last["panel"]
    assert_equal false, steps.first["view_adjusted"]
  end

  test "a viewer's AI gets the steps without the presenter's notes or the drafts" do
    map = maps(:ahinvaux)
    map.presentations.create!(name: "Pré-design", steps: [
      { id: "a", title: "Votre projet", note: "Rappelle leurs mots" },
      { id: "b", title: "Brouillon", shown: false, slide: { body: "" }, proposal: { body: "Texte", new: true } }
    ])

    data, error = call_tool(personal_token(users(:alice)), "get_map", { map_id: map.id })
    refute error, data
    steps = data["presentations"]["list"].sole["steps"]
    assert_equal [ "Votre projet" ], steps.map { _1["title"] }
    assert_nil steps.first["note"]

    data, = call_tool(personal_token(users(:michael)), "get_map", { map_id: map.id })
    steps = data["presentations"]["list"].sole["steps"]
    assert_equal "Rappelle leurs mots", steps.first["note"]
    assert_equal({ "body" => "Texte", "new" => true }, steps.last["pending_proposal"])
  end

  test "propose_presentation_slides drafts slides an editor accepts in the panel" do
    map = maps(:ahinvaux)
    data, error = call_tool(personal_token(users(:michael)), "propose_presentation_slides", { map_id: map.id, slides: [ { body: "x", rationale: "court" } ] })
    assert error, "a rationale under 10 characters is refused by the schema"

    purpose = PresentationTemplate.find("pre_design").steps.find { _1["key"] == "purpose" }
    assert_equal({ "body" => "" }, purpose["slide"])

    data, error = call_tool(personal_token(users(:michael)), "propose_presentation_slides", { map_id: map.id, slides: [
      { step_id: "nope", body: "Rien", rationale: "Une étape qui n'existe pas" }
    ] })
    assert error, "nothing placed is an error"
    presentation = map.presentations.sole
    assert_equal "pre_design", presentation.template_key, "a map without a presentation gets the pre-design one"

    purpose_id = presentation.steps.find { _1["key"] == "purpose" }["id"]
    sun_id = presentation.steps.find { _1["key"] == "sun" }["id"]
    data, error = call_tool(personal_token(users(:michael)), "propose_presentation_slides", { map_id: map.id, slides: [
      { step_id: purpose_id, body: "Un lieu qui nourrit la famille\n- et le sol", rationale: "Fiche projet, ambitions : nourrir la famille." },
      { after_step_id: sun_id, title: "Ce que le soleil permet", body: "Une pente plein sud", rationale: "Lecture du terrain : pente sud." },
      { step_id: sun_id, body: "Pas une diapositive", rationale: "Une vue de la carte, refusée" }
    ] })
    refute error, data
    assert_equal 2, data["created"].size
    assert_equal [ 2 ], data["rejected"].map { _1["index"] }
    assert_match %r{\?panel=present\z}, data["review_url"]

    steps = presentation.reload.steps
    purpose = steps.find { _1["id"] == purpose_id }
    assert_equal "", purpose.dig("slide", "body"), "nothing shown before an editor accepts"
    assert_equal "Un lieu qui nourrit la famille\n- et le sol", purpose.dig("proposal", "body")
    added = steps[steps.index { _1["id"] == sun_id } + 1]
    assert_equal [ "Ce que le soleil permet", false, true ], [ added["title"], added["shown"], added.dig("proposal", "new") ]

    _, error = call_tool(personal_token(users(:alice)), "propose_presentation_slides", { map_id: map.id, slides: [ { body: "Texte", rationale: "Une raison assez longue" } ] })
    assert error, "a viewer cannot propose"
  end

  test "a slide keeps a long Markdown text whole: titles, lists and tables pasted from a document" do
    map = maps(:ahinvaux)
    rows = Array.new(300) { "| Besoin #{_1} | Fonction #{_1} |" }
    body = "### Pour vous\n\n| Besoins | Fonctions |\n| --- | --- |\n#{rows.join("\n")}\n\n- **Sol** : stop aux engins lourds\n1. Cogestion avec Semisto"
    assert_operator body.size, :>, 4_000
    data, error = call_tool(personal_token(users(:michael)), "propose_presentation_slides", { map_id: map.id, slides: [
      { title: "Analyse fonctionnelle", body:, rationale: "Le tableau des besoins et fonctions de l'analyse" }
    ] })
    refute error, data
    step = map.presentations.sole.steps.find { _1.dig("proposal", "title") == "Analyse fonctionnelle" }
    assert_equal body, step["proposal"]["body"]
    assert_equal body, MapPresentation.clean_slide({ "body" => body })["body"]
  end
end
