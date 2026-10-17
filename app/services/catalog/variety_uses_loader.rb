module Catalog
  # Loads what fruit varieties are good for and when they keep
  # (db/seeds/plants/varieties/*.yml): uses, picking month, eating season.
  # Values only, each entry citing the reference it was read from (upstream
  # source and URL); source « semisto », status « to_verify » until someone
  # checks them. Runs with the seeds, on every deploy.
  #
  # Never creates a variety: an entry fills the varieties of its species
  # whose name matches one of its `names`, ignoring case, accents and
  # punctuation, and each part of a name like « Cabarette / Président Van
  # Dievoet ». Never overwrites a value another source wrote since.
  #
  #   - species: Malus domestica
  #     names: ["Grenadier"]
  #     uses: [cooking, juice]
  #     picking_month: 9
  #     eating_from_month: 9
  #     eating_until_month: 11
  #     upstream_source: "CRA-W"
  #     url: https://…
  class VarietyUsesLoader
    SOURCE = "semisto".freeze
    FIELDS = %w[uses picking_month eating_from_month eating_until_month].freeze

    def self.default_paths = Dir[Rails.root.join("db/seeds/plants/varieties/*.yml")].sort

    def self.key(name) = I18n.transliterate(name.to_s).downcase.gsub(/[^a-z0-9]+/, " ").squish

    def initialize(paths = self.class.default_paths)
      @paths = paths
    end

    # Returns { updated:, missing: [names] }.
    def call
      result = { updated: 0, missing: [] }
      entries.each do |entry|
        varieties = matching(entry)
        result[:missing] << entry["names"].first if varieties.empty?
        varieties.each { |variety| result[:updated] += 1 if write(variety, entry) }
      end
      result
    end

    def entries
      @paths.flat_map { |path| Array(YAML.safe_load_file(path)) }
    end

    private
      def matching(entry)
        species = PlantSpecies.find_by_latin_name(entry.fetch("species"))
        return [] unless species
        keys = Array(entry["names"]).map { self.class.key(_1) }
        species.varieties.includes(:field_sources).select do |variety|
          parts = [ variety.name, *variety.name.split("/") ].map { self.class.key(_1) }
          parts.intersect?(keys)
        end
      end

      def write(variety, entry)
        fields = FIELDS.select { |field| entry[field].present? && variety.provenance_writable?(field, SOURCE) }
        return false if fields.empty?
        variety.update!(entry.slice(*fields))
        variety.record_provenance!(fields, source: SOURCE, upstream_source: entry["upstream_source"], url: entry["url"])
        true
      end
  end
end
