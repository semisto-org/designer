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
end
