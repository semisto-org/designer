require "yaml"

# The rule of docs/quality/: a reference journey that fails two of the five
# questions of docs/point-of-view.md blocks new features in its domain until
# it is fixed. Here, a new feature is a new file under the domain's paths; a
# pull request that works on the journey itself says so with a line
# « Quality: <journey id> » in its description.
#
#   QualityGate.new(journeys: YAML.load_file("docs/quality/journeys.yml")["journeys"])
#     .check(added: [ "app/frontend/collab/Foo.tsx" ], description: "…")
#   # => [ { journey: "invite", files: [ "app/frontend/collab/Foo.tsx" ] } ]
class QualityGate
  QUESTIONS = %w[place time companion notebook further].freeze
  SCORES = %w[pass partial fail].freeze
  BLOCKING_FAILS = 2

  def self.load(path = File.expand_path("../docs/quality/journeys.yml", __dir__))
    new(journeys: YAML.load_file(path).fetch("journeys"))
  end

  attr_reader :journeys

  def initialize(journeys:)
    @journeys = journeys
  end

  def self.blocked?(journey)
    journey.fetch("scores").values.count("fail") >= BLOCKING_FAILS
  end

  def blocked = journeys.select { |journey| self.class.blocked?(journey) }

  # The blocked journeys the added files fall under, unless the description
  # names them.
  def check(added:, description: "")
    declared = description.to_s.scan(/^\s*Quality:\s*([\w, -]+)$/i).flatten.flat_map { |ids| ids.split(/[\s,]+/) }
    blocked.filter_map do |journey|
      next if declared.include?(journey.fetch("id"))
      files = added.select { |file| journey.fetch("paths").any? { |glob| File.fnmatch?(glob, file, File::FNM_PATHNAME | File::FNM_EXTGLOB) } }
      { journey: journey.fetch("id"), title: journey.fetch("title"), files: } if files.any?
    end
  end
end
