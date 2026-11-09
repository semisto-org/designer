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

  # A slide's text from the analysis, in Markdown as the slide editor writes
  # it: needs beside the functions they call for, challenges beside assets,
  # in two-column tables as designers lay them out. nil when the analysis
  # says nothing of it.
  def self.analysis_body(slide, sheet)
    analysis = sheet.section("analysis")
    names = ->(list) { Array(analysis[list]).map { _1["name"].to_s.squish.gsub("|", "\\|") }.compact_blank }
    label = ->(key) { I18n.t("presentations.analysis.#{key}") }
    table = lambda do |left, right, lefts, rights|
      rows = [ lefts.size, rights.size ].max
      next nil if rows.zero?
      [ "| #{left} | #{right} |", "| --- | --- |", *Array.new(rows) { "| #{lefts[_1]} | #{rights[_1]} |" } ].join("\n")
    end
    titled = ->(key, body) { body && "### #{label.(key)}\n\n#{body}" }
    blocks = case slide
    when "purpose" then [ analysis["purpose"] ]
    when "functions"
      %w[holder place].map do |who|
        titled.(who, table.(label.("needs"), label.("functions"), names.("#{who}_needs"), names.("#{who}_functions")))
      end
    when "challenges" then [ table.(label.("challenges"), label.("assets"), names.("challenges"), names.("assets")) ]
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
