module Catalog
  # Loads the starter catalogue (db/seeds/plants/*.yml): about ninety species
  # of Belgian forest gardens, written by Semisto from general horticultural
  # knowledge. Values only (no copied text), source « semisto », status
  # « to_verify » until someone checks each value against a reference.
  #
  # Idempotent by latin name: a re-run (every deploy) updates its own values
  # and fills blanks, never duplicates, and never overwrites a value another
  # source (an import, a person) wrote since.
  #
  # YAML keys are column names, plus:
  #   common_names: [..]        French names, the first one is the usual one;
  #   synonyms: [..]            older or other latin names (names in language
  #                             « la »: found by the search and the imports);
  #   height_m / spread_m: [min, max] in metres;
  #   varieties: [..]           cultivar names.
  class SeedLoader
    SOURCE = "semisto".freeze
    PAIRS = { "height_m" => %w[height_min_m height_max_m], "spread_m" => %w[spread_min_m spread_max_m] }.freeze
    SPECIAL = %w[latin_name common_names synonyms varieties] + PAIRS.keys

    def self.default_paths = Dir[Rails.root.join("db/seeds/plants/*.yml")].sort

    def initialize(paths = self.class.default_paths)
      @paths = paths
      @writer = SpeciesWriter.new(source: SOURCE, status: "to_verify", keep_others: true)
    end

    # Returns { created:, updated: }.
    def call
      counts = { created: 0, updated: 0 }
      entries.each do |entry|
        species = PlantSpecies.find_by_latin_name(entry.fetch("latin_name")) || PlantSpecies.new(latin_name: entry["latin_name"])
        counts[species.new_record? ? :created : :updated] += 1
        PlantSpecies.transaction do
          species.genus ||= PlantGenus.for_latin_name(species.latin_name)
          @writer.write(species, attributes(entry), common_names: entry["common_names"])
          write_synonyms(species, entry["synonyms"])
          Array(entry["varieties"]).each { |name| variety_for(species, name) }
        end
      end
      counts
    end

    def entries
      @paths.flat_map { |path| Array(YAML.safe_load_file(path)) }
    end

    private
      def attributes(entry)
        attrs = entry.except(*SPECIAL)
        PAIRS.each do |key, (min_field, max_field)|
          min, max = Array(entry[key])
          attrs[min_field] = min
          attrs[max_field] = max || min
        end
        attrs
      end

      # Latin synonyms belong to this seed (no other source writes them): kept
      # in step with the file, outside the French names and their provenance.
      def write_synonyms(species, names)
        names = Array(names).map { |name| name.to_s.squish }.reject(&:blank?)
        current = species.common_names.select { |name| name.language == "la" }.map(&:name)
        species.replace_common_names!(names, language: "la") if names.any? && current != names
      end

      def variety_for(species, name)
        species.varieties.where("lower(name) = ?", name.to_s.squish.downcase).first ||
          species.varieties.create!(name:)
      end
  end
end
