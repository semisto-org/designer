module SoilAnalysis
  # The curated list of bio-indicator plants (config/soil/bioindicators.yml):
  # what each wild plant says about the soil. Provenance on every entry:
  # « semisto, à vérifier ». Plus a tally of what a set of observations points to.
  module BioindicatorCatalog
    FILE = Rails.root.join("config/soil/bioindicators.yml")
    INDICATORS = %w[compaction waterlogging acidic calcareous nitrogen_rich nitrogen_poor disturbed dry fertile trampled].freeze
    ABUNDANCE_WEIGHT = { "rare" => 1, "present" => 2, "frequent" => 3, "dominant" => 4 }.freeze

    module_function

    def all
      @all ||= begin
        data = YAML.safe_load_file(FILE)
        data["plants"].map { |plant| plant.merge("provenance" => plant["provenance"] || data["provenance"]).freeze }.freeze
      end
    end

    def find(key) = by_key[key.to_s]

    def keys = by_key.keys

    # Entries whose name or Latin name contains the text (accents and case ignored).
    def search(query, limit: 10)
      needle = fold(query)
      return all.first(limit) if needle.empty?
      all.select { |plant| fold(plant["name"]).include?(needle) || fold(plant["latin"]).include?(needle) }.first(limit)
    end

    # What the observations point to: [{ key:, score:, plants: [names] }],
    # strongest first. A plant counts for its abundance (rare 1 … dominant 4).
    def tally(observations)
      scores = Hash.new { |hash, key| hash[key] = { score: 0, plants: [] } }
      observations.each do |observation|
        weight = ABUNDANCE_WEIGHT.fetch(observation.abundance, 1)
        observation.indicators.each do |indicator|
          scores[indicator][:score] += weight
          scores[indicator][:plants] |= [ observation.species_name ]
        end
      end
      scores.map { |key, value| { key:, score: value[:score], plants: value[:plants] } }.sort_by { |row| [ -row[:score], row[:key] ] }
    end

    def by_key = (@by_key ||= all.index_by { |plant| plant["key"] }.freeze)

    def fold(text) = I18n.transliterate(text.to_s).downcase.strip
  end
end
