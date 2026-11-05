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
    assert_equal [ "Votre projet", "Micro-climats" ], steps.map { _1["title"] }
    assert_equal [ true, false ], steps.map { _1["shown"] }
    assert_equal "project", steps.first["panel"]
    assert_equal false, steps.first["view_adjusted"]
  end
end
