module Imports
  module Claudy
    # Finds the Designer species (and cultivar) of a Claudy plant by its latin
    # name, normalised: case, accents, hybrid sign, cultivar quotes, author
    # abbreviations and « (groupe) »-style notes are ignored.
    #
    #   "Malus domestica Borkh."           → malus domestica
    #   "Malus domestica 'Reinette grise'" → malus domestica, cultivar « Reinette grise »
    #   "Mespilus germanica L."            → mespilus germanica
    #   "Prunus ×gondouinii"               → prunus x gondouinii
    #   "Sambucus nigra subsp. canadensis" → sambucus nigra subsp canadensis
    #
    # The full canonical name wins; else the binomial (genus + epithet) when it
    # points to exactly one species. Nothing is ever created in the catalogue:
    # it is shared by every map and curated with provenance.
    class SpeciesMatcher
      RANKS = { "subsp" => "subsp", "ssp" => "subsp", "var" => "var", "f" => "f", "forma" => "f", "subvar" => "subvar" }.freeze
      QUOTES = /['‘’"«»]/
      WORD = /\A[a-z][a-z-]*\z/

      Match = Data.define(:species, :variety, :cultivar)

      class << self
        # "malus domestica" (genus, epithet, infraspecific rank and name), or nil.
        def canonical(latin) = parse(latin)&.first

        # "malus domestica", "prunus x gondouinii", or nil.
        def binomial(latin) = parse(latin)&.last

        # « Malus domestica 'Belle de Boskoop' » → « Belle de Boskoop ».
        def cultivar(latin)
          text = latin.to_s
          (text[/#{QUOTES}(.+)#{QUOTES}/o, 1] || text[/\bcv\.?\s+(.+)\z/i, 1])&.squish.presence
        end

        # Case, accents and quotes ignored: « Reinette d’Orléans » = « reinette d orleans ».
        def fold(name) = PlantVocabulary.normalize(name.to_s.gsub(QUOTES, " ")).to_s.squish

        private
          # [canonical, binomial] or nil when there is not even a genus.
          def parse(latin)
            tokens = clean(strip_cultivar(latin)).split
            parts = []
            parts << tokens.shift if tokens.first == "x" # hybrid genus: « × Sorbopyrus »
            genus = tokens.shift&.delete_suffix(".")
            return nil if genus.blank?
            parts << genus
            epithet = tokens.shift
            if epithet == "x" # hybrid species: « Prunus × gondouinii »
              parts << "x"
              epithet = tokens.shift
            end
            return [ parts.join(" "), nil ] unless epithet&.match?(WORD)
            parts << epithet
            binomial = parts.join(" ")
            while (token = tokens.shift)
              rank = RANKS[token.delete_suffix(".")]
              parts << rank << tokens.shift if rank && tokens.first&.match?(WORD)
            end
            [ parts.join(" "), binomial ]
          end

          def clean(latin)
            text = PlantVocabulary.utf8(latin).gsub("×", " x ")
            text = text.unicode_normalize(:nfd).gsub(/\p{Mn}/, "").downcase
            text.gsub(/\([^)]*\)/, " ").gsub(/[^a-z.\s-]/, " ").squish
          end

          def strip_cultivar(latin)
            latin.to_s.sub(/\s*#{QUOTES}.*\z/o, "").sub(/\s+cv\.?\s+.*\z/i, "")
          end
      end

      def initialize(scope = PlantSpecies.all)
        @by_canonical = {}
        @by_binomial = {}
        scope.includes(:varieties).find_each do |species|
          canonical = self.class.canonical(species.latin_name)
          @by_canonical[canonical] ||= species if canonical
          binomial = self.class.binomial(species.latin_name)
          (@by_binomial[binomial] ||= []) << species if binomial
        end
      end

      # A Match for a Claudy plant's species and variety, or nil. `latin_name`
      # is tried first, then `name` (some species carry their latin name there).
      def match(latin_name:, name: nil, variety: nil)
        [ latin_name, name ].each do |candidate|
          species = find_species(candidate)
          next unless species
          cultivar = variety.presence || self.class.cultivar(candidate)
          return Match.new(species:, variety: find_variety(species, cultivar), cultivar:)
        end
        nil
      end

      def find_species(latin)
        binomial = self.class.binomial(latin)
        return nil unless binomial
        @by_canonical[self.class.canonical(latin)] || unique(@by_binomial[binomial])
      end

      private
        def unique(candidates) = candidates&.one? ? candidates.first : nil

        def find_variety(species, cultivar)
          return nil if cultivar.blank?
          wanted = self.class.fold(cultivar)
          species.varieties.find { |variety| self.class.fold(variety.name) == wanted }
        end
    end
  end
end
