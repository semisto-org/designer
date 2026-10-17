module Catalog
  # Sorts the species of Terranova (Semisto's internal app) into three
  # baskets before they come into the Designer catalogue. Michael's rule
  # (2026-10-17): fewer values that are right rather than many that are wrong.
  #
  # - A: audited in Terranova, a clean botanical name, some values, no twin.
  #   Imported as proposed species, values « to_verify », reviewed one by one.
  # - B: worth keeping but to clean first (suspicious name, never audited,
  #   duplicate, sizes that contradict each other).
  # - C: not migrated (no species name, or nothing known and nobody uses it).
  #
  # Each entry says why. Basket A comes first by usage in Terranova (palettes,
  # design projects, nursery stock, specimens), so the review queue starts
  # with the plants Semisto actually uses.
  class TerranovaTriage
    Entry = Struct.new(:row, :basket, :reasons, :match, :conflicts, keyword_init: true) do
      def id = row["id"]
      def latin_name = row["latin_name"].to_s.squish
      def usage = row.dig("usage", "total").to_i
      def audited? = row["audited_at"].present?
      def a? = basket == "A"
    end

    # A genus, an optional hybrid sign, an epithet, an optional subspecies or
    # variety: « Malus domestica », « Tilia × europaea », « × Sorbaronia
    # mitschurinii », « Allium cepa var. proliferum ».
    CLEAN_NAME = /\A(?:× )?[A-Z][a-z]+(?: ×)? [a-z][a-z-]+(?: (?:subsp|var)\. [a-z][a-z-]+)?\z/
    # At least an attempt at a binomial (« digitalis purpurea » is one, to
    # clean); a genus alone (« Rubus ») or a French name is not.
    LATIN_NAME = /\A(?:× )?[A-Za-z][a-z-]+ (?:× ?)?[a-zA-Z(]/
    MAX_HEIGHT_M = 120 # a coast redwood

    # Designer fields compared with an existing species to list conflicts.
    COMPARED_FIELDS = %w[plant_type strata height_max_m spread_max_m hardiness_zone edible_rating].freeze

    attr_reader :entries

    def initialize(species_rows)
      @entries = species_rows.map { |row| classify(row) }
      mark_duplicates
      @entries.each { |entry| entry.basket = basket_for(entry) }
      @entries.sort_by! { |entry| [ entry.basket, -entry.usage, entry.latin_name.downcase ] }
      attach_matches
    end

    def basket(letter) = entries.select { _1.basket == letter }

    def counts = %w[A B C].index_with { basket(_1).size }

    # « Malus  x domestica », « Tilia ×europaea » and « Tilia × europaea »
    # are one name.
    def self.normalize(name)
      name.to_s.squish.gsub(/\s+[x×]\s+/i, " × ").gsub(/\A[x×]\s+/i, "× ").gsub(/ ×(?=[a-z])/, " × ")
    end

    private
      def classify(row)
        name = self.class.normalize(row["latin_name"])
        reasons = []
        if name.blank? || !name.match?(LATIN_NAME)
          reasons << :not_a_species_name
        elsif !name.match?(CLEAN_NAME)
          reasons << :suspicious_name
        end
        reasons << :not_audited if row["audited_at"].blank?
        reasons << :no_values if TerranovaImport.species_attributes(row).values.all? { blank?(_1) }
        reasons << :inconsistent_sizes if inconsistent_sizes?(row)
        Entry.new(row: row.merge("latin_name" => name), reasons:, conflicts: [])
      end

      def inconsistent_sizes?(row)
        pairs = [ %w[height_min_cm height_max_cm], %w[spread_min_cm spread_max_cm] ]
        pairs.any? do |min, max|
          low, high = Float(row[min], exception: false), Float(row[max], exception: false)
          (low && high && low > high) || (high && high > MAX_HEIGHT_M * 100)
        end
      end

      # The best row of a group of twins stays a candidate; the others are
      # duplicates to merge first.
      def mark_duplicates
        @entries.group_by { _1.latin_name.downcase }.each_value do |twins|
          next if twins.size < 2
          best = twins.max_by { |entry| [ entry.audited? ? 1 : 0, entry.usage, -entry.reasons.size, -entry.id.to_i ] }
          (twins - [ best ]).each { |entry| entry.reasons << :duplicate }
        end
      end

      def basket_for(entry)
        reasons = entry.reasons
        return "C" if reasons.include?(:not_a_species_name)
        return "C" if reasons.include?(:no_values) && entry.usage.zero?
        reasons.empty? ? "A" : "B"
      end

      # The Designer species each row would update, and the values both sides
      # know but disagree on (the Designer's value is kept).
      def attach_matches
        by_id = PlantSpecies.where(terranova_id: entries.map(&:id)).index_by(&:terranova_id)
        by_name = PlantSpecies.where("lower(latin_name) IN (?)", entries.map { _1.latin_name.downcase }).index_by { _1.latin_name.downcase }
        entries.each do |entry|
          entry.match = by_id[entry.id] || by_name[entry.latin_name.downcase]
          next unless entry.match
          incoming = TerranovaImport.species_attributes(entry.row)
          entry.conflicts = COMPARED_FIELDS.filter_map do |field|
            ours, theirs = entry.match.public_send(field), incoming[field]
            next if blank?(ours) || blank?(theirs) || same?(ours, theirs)
            [ field, ours, theirs ]
          end
        end
      end

      def same?(ours, theirs)
        return ours.to_f == theirs.to_f if ours.is_a?(Numeric) && theirs.is_a?(Numeric)
        Array(ours).map(&:to_s).sort == Array(theirs).map(&:to_s).sort
      end

      def blank?(value) = value.nil? || (value.respond_to?(:empty?) && value.empty?)
  end
end
