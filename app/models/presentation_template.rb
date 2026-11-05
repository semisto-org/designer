# A sequence Semisto's team walks clients through, kept in
# config/presentation_templates/<key>.yml (views) and
# config/locales/presentations.fr.yml (titles and presenter notes). It gives
# a map's presentation its first steps, each with a default view the
# presenter then adjusts to the place (MapPresentation).
class PresentationTemplate
  DIR = Rails.root.join("config/presentation_templates")

  attr_reader :key

  def self.all = DIR.glob("*.yml").sort.map { new(_1.basename(".yml").to_s) }

  def self.find(key)
    key = key.to_s
    all.find { _1.key == key } or raise ActiveRecord::RecordNotFound, "presentation template #{key}"
  end

  def initialize(key)
    @key = key
  end

  def name = I18n.t("presentations.templates.#{key}.name")

  def steps
    definition.fetch("steps").map do |step|
      i18n = "presentations.templates.#{key}.steps.#{step.fetch('key')}"
      { "key" => step["key"], "title" => I18n.t("#{i18n}.title"), "note" => I18n.t("#{i18n}.note", default: nil), "shown" => true, "captured" => false, "view" => view(step) }
    end
  end

  def as_json(*) = { key:, name:, count: definition.fetch("steps").size }

  private
    def definition
      @definition ||= YAML.safe_load_file(DIR.join("#{key}.yml"))
    end

    # The template names what is shown; a view stores what is hidden.
    def view(step)
      {
        "panel" => step["panel"],
        "hiddenLayers" => step["layers"] ? MapFeature::LAYERS - step["layers"] : [],
        "hiddenKinds" => [],
        "hiddenStrata" => step["strata"] ? MapPresentation::STRATA - step["strata"] : [],
        "sectors" => step["sectors"],
        "moment" => step["moment"] || "today",
        # The land as it is for the reading of the place, the project after.
        "mode" => step["mode"],
        "shade" => step["shade"],
        "relief" => step["relief"]
      }
    end
end
