module SoilAnalysis
  # The curated list of bio-indicator plants (config/soil/bioindicators.yml):
  # what each wild plant says about the soil, each claim with its evidence
  # (sourced from open indicator datasets, or to_verify when none covers it).
  # Plus a tally of what a set of observations points to.
  module BioindicatorCatalog
    FILE = Rails.root.join("config/soil/bioindicators.yml")
    INDICATORS = %w[compaction waterlogging acidic calcareous nitrogen_rich nitrogen_poor disturbed dry fertile trampled].freeze
    ABUNDANCE_WEIGHT = { "rare" => 1, "present" => 2, "frequent" => 3, "dominant" => 4 }.freeze
    PROVENANCE = "EIVE 1.0 (Dengler et al. 2023), perturbation (Midolo et al. 2023) et habitats EUNIS (Chytrý et al. 2020), sous licence CC BY 4.0 ; les indications marquées « à vérifier » (surtout le tassement) ne viennent que de la littérature de permaculture".freeze

    module_function

    def all
      @all ||= begin
        data = YAML.safe_load_file(FILE)
        data["plants"].map { |plant| entry(plant) }.freeze
      end
    end

    def sources
      @sources ||= YAML.safe_load_file(FILE)["sources"].index_by { |source| source["key"] }.freeze
    end

    # The claims no open dataset supports.
    def unverified(plant) = Array(plant["indicates"]).reject { |key| plant.dig("evidence", key, "status") == "sourced" }

    def find(key) = by_key[key.to_s]

    def keys = by_key.keys

    # The entry for a Latin name from Pl@ntNet ("Urtica dioica L.",
    # "Taraxacum officinale aggr."): genus and species epithet compared,
    # authorship and qualifiers ignored. Nil when the list does not have it.
    def find_by_latin(latin_name)
      target = PlantIdentification::CatalogueMatcher.binomial(latin_name)
      target && by_binomial[target]
    end

    # Entries whose name or Latin name contains the text (accents and case ignored).
    def search(query, limit: 10)
      needle = fold(query)
      return all.first(limit) if needle.empty?
      all.select { |plant| fold(plant["name"]).include?(needle) || fold(plant["latin"]).include?(needle) }.first(limit)
    end

    # What the observations point to: [{ key:, score:, plants: [names], unverified: }],
    # strongest first. A plant counts for its abundance (rare 1 … dominant 4).
    # `unverified`: only claims « à vérifier » point there.
    def tally(observations)
      scores = Hash.new { |hash, key| hash[key] = { score: 0, plants: [], sourced: false } }
      observations.each do |observation|
        weight = ABUNDANCE_WEIGHT.fetch(observation.abundance, 1)
        unverified = observation.unverified_indicators
        observation.indicators.each do |indicator|
          scores[indicator][:score] += weight
          scores[indicator][:plants] |= [ observation.species_name ]
          scores[indicator][:sourced] ||= !unverified.include?(indicator)
        end
      end
      scores.map { |key, value| { key:, score: value[:score], plants: value[:plants], unverified: !value[:sourced] } }.sort_by { |row| [ -row[:score], row[:key] ] }
    end

    # A plant as the interface sees it: the claims with their evidence (refs
    # resolved to a short label and a link), without the raw figures.
    def entry(plant)
      evidence = Array(plant["indicates"]).index_with do |key|
        claim = plant.dig("evidence", key) || {}
        { "status" => claim["status"] || "to_verify", "detail" => claim["detail"],
          "sources" => Array(claim["refs"]).filter_map { |ref| source_label(ref) } }
      end
      plant.except("values").merge("evidence" => evidence, "unverified" => unverified(plant), "provenance" => PROVENANCE).freeze
    end

    def source_label(ref)
      source = sources[ref] or return nil
      { "label" => source["short"], "title" => source["title"], "url" => source["url"] }
    end

    def by_key = (@by_key ||= all.index_by { |plant| plant["key"] }.freeze)

    def by_binomial
      @by_binomial ||= all.each_with_object({}) do |plant, index|
        binomial = PlantIdentification::CatalogueMatcher.binomial(plant["latin"])
        index[binomial] ||= plant if binomial
      end.freeze
    end

    def fold(text) = I18n.transliterate(text.to_s).downcase.strip
  end
end
