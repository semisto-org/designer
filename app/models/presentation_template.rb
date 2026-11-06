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

  # map: the place the presentation is for. Its project sheet's functional
  # analysis fills the text slides that say the same thing (purpose, needs
  # and functions, challenges and assets): written once, shown as is.
  def steps(map: nil)
    sheet = map && ProjectSheet.parse(map.project, strict: false)
    definition.fetch("steps").map do |step|
      i18n = "presentations.templates.#{key}.steps.#{step.fetch('key')}"
      { "key" => step["key"], "title" => I18n.t("#{i18n}.title"), "note" => I18n.t("#{i18n}.note", default: nil), "shown" => true, "captured" => false,
        "slide" => step["slide"] ? { "body" => (sheet && analysis_body(step["key"], sheet)) || "" } : nil, "view" => view(step) }.compact
    end
  end

  # A slide's text from the analysis, in the slide's own form: a short
  # heading line, then « - » lines. nil when the analysis says nothing of it.
  def self.analysis_body(slide, sheet)
    analysis = sheet.section("analysis")
    names = ->(list) { Array(analysis[list]).map { "- #{_1['name']}" } }
    block = ->(heading, lines) { lines.any? ? [ I18n.t("presentations.analysis.#{heading}"), *lines ].join("\n") : nil }
    blocks = case slide
    when "purpose" then [ analysis["purpose"] ]
    when "functions"
      [ block.("holder_needs", names.("holder_needs")), block.("place_needs", names.("place_needs")),
        block.("functions", names.("holder_functions") + names.("place_functions")) ]
    when "challenges" then [ block.("challenges", names.("challenges")), block.("assets", names.("assets")) ]
    else []
    end
    blocks.compact_blank.join("\n\n").presence&.truncate(MapPresentation::MAX_BODY)
  end

  def as_json(*) = { key:, name:, count: definition.fetch("steps").size }

  private
    def analysis_body(slide, sheet) = self.class.analysis_body(slide, sheet)

    def definition
      @definition ||= YAML.safe_load_file(DIR.join("#{key}.yml"))
    end

    # The template names what is shown; a view stores what is hidden.
    def view(step)
      {
        "panel" => step["panel"],
        # Drawn zones (the forest garden as a zone…) stay on every view; « Existant »
        # and « Projet » already keep a project zone out of the reading of the place.
        "hiddenLayers" => step["layers"] ? MapFeature::LAYERS - step["layers"] - [ "drawings" ] : [],
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
