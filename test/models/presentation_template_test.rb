require "test_helper"

class PresentationTemplateTest < ActiveSupport::TestCase
  test "every template step has a title, a note and a known panel, layers and strata" do
    panels = Rails.root.join("app/frontend/map/panels/index.ts").read.scan(/\{ id: '([a-z-]+)'/).flatten
    PresentationTemplate.all.each do |template|
      assert template.name.present?
      definition = YAML.safe_load_file(PresentationTemplate::DIR.join("#{template.key}.yml"))
      definition["steps"].each do |step|
        assert_includes panels, step["panel"], "#{template.key}/#{step['key']}" if step["panel"]
        assert_empty Array(step["layers"]) - MapFeature::LAYERS, step["key"]
        assert_empty Array(step["strata"]) - MapPresentation::STRATA, step["key"]
        assert_empty Array(step["sectors"]) - MapPresentation::SECTOR_GROUPS, step["key"]
      end
      template.steps.each do |step|
        assert_not step["title"].start_with?("Translation missing"), step["key"]
        assert step["note"].present?, step["key"]
        assert_equal step.merge("view" => step["view"].compact), MapPresentation.clean_step(step).except("id"), step["key"]
      end
    end
  end

  test "the pre-design slides start from the project sheet's functional analysis" do
    map = maps(:ahinvaux)
    map.update!(project: ProjectSheet.merge({}, { "analysis" => {
      "purpose" => "Un jardin habité et vivant.",
      "holder_needs" => [ { "name" => "Entretien simple" } ],
      "place_functions" => [ { "name" => "Fertiliser" } ],
      "challenges" => [ { "name" => "Hydromorphisme", "origin" => "place" } ]
    } }).to_h)
    steps = PresentationTemplate.find("pre_design").steps(map:).index_by { _1["key"] }
    assert_equal "Un jardin habité et vivant.", steps["purpose"]["slide"]["body"]
    assert_equal "### Pour vous\n\n| Besoins | Fonctions |\n| --- | --- |\n| Entretien simple |  |\n\n" \
                 "### Pour le lieu\n\n| Besoins | Fonctions |\n| --- | --- |\n|  | Fertiliser |", steps["functions"]["slide"]["body"]
    assert_equal "| Défis | Atouts |\n| --- | --- |\n| Hydromorphisme |  |", steps["challenges"]["slide"]["body"]
    assert_equal "", steps["cover"]["slide"]["body"]
    assert_equal "", PresentationTemplate.find("pre_design").steps.find { _1["key"] == "purpose" }["slide"]["body"]
  end
end
