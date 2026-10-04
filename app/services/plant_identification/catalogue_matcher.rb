# Ported from Claudy (MIT, © 2022-2023 Fondation Les 4 Sources)

class PlantIdentification
  # Matches a latin name from Pl@ntNet to a catalogue species: the exact name
  # first (case and spacing ignored), then genus + species whatever the
  # authorship or hybrid sign around it ("Malus domestica (Suckow) Borkh.",
  # "Mentha x piperita" and "Mentha × piperita" are one species).
  class CatalogueMatcher
    HYBRID_SIGNS = %w[× x].freeze

    # "Malus domestica (Suckow) Borkh." => "malus domestica"; nil when there is
    # no species epithet (a genus alone is not a species).
    def self.binomial(name)
      words = name.to_s.downcase.squish.split(" ").reject { |word| HYBRID_SIGNS.include?(word) }
      words.first(2).join(" ") if words.size >= 2
    end

    def match(latin_name)
      PlantSpecies.includes(:common_names).find_by_latin_name(latin_name) || match_binomial(latin_name)
    end

    private
      # One query on the genus, the species epithet compared in Ruby; the
      # shortest name wins (the species before its subspecies).
      def match_binomial(latin_name)
        target = self.class.binomial(latin_name)
        return if target.nil?

        genus = target.split(" ").first
        prefix = PlantSpecies.sanitize_sql_like(genus)
        PlantSpecies.includes(:common_names)
                    .where("lower(plant_species.latin_name) LIKE :plain OR lower(plant_species.latin_name) LIKE :hybrid",
                           plain: "#{prefix} %", hybrid: "× #{prefix} %")
                    .select { |species| self.class.binomial(species.latin_name) == target }
                    .min_by { |species| species.latin_name.length }
      end
  end
end
