# Species to suggest for a map's palette when the designer has not searched
# yet: hardy in the site's zone, not invasive in its country, not already
# chosen, and first those that fill what the palette lacks (a nitrogen
# fixer, a missing strata, melliferous plants). Natives first.
class PaletteSuggestions
  LIMIT = 8
  PER_NEED = 3
  KEY_STRATA = %w[sub_canopy shrub herbaceous ground_cover].freeze

  Suggestion = Data.define(:species, :reason) do
    def as_json(*) = species.summary_json.merge(reason:)
  end

  def initialize(map, limit: LIMIT)
    @map = map
    @limit = limit
  end

  def suggestions
    @suggestions ||= begin
      chosen = []
      needs.each do |reason, scope|
        break if chosen.size >= @limit
        taken = chosen.map { |s| s.species.id }
        scope.where.not(id: taken).limit(PER_NEED).each { |species| chosen << Suggestion.new(species:, reason:) }
      end
      chosen.first(@limit)
    end
  end

  def as_json(*) = { suggestions: suggestions.map(&:as_json), zone: @map.hardiness_zone }

  private
    def palette_species
      @palette_species ||= PlantSpecies.where(id: @map.palette_items.select(:species_id)).to_a
    end

    def candidates
      scope = PlantSpecies.where.not(id: palette_species.map(&:id)).with_card_data
      zone = @map.hardiness_zone
      scope = scope.where(hardiness_zone: ..zone) if zone
      country = @map.country_code
      if country
        scope = scope.where.not("? = ANY(plant_species.invasive_countries)", country)
        scope = scope.order(Arel.sql(PlantSpecies.sanitize_sql_array([ "(? = ANY(plant_species.native_countries)) DESC", country ])))
      end
      scope.alphabetical
    end

    def needs
      found = []
      found << [ "nitrogen", candidates.where("'nitrogen' = ANY(plant_species.eco_services)") ] if palette_species.none?(&:nitrogen_fixer?)
      present = palette_species.map(&:default_strata)
      (KEY_STRATA - present).each do |strata|
        found << [ "strata_#{strata}", candidates.where("#{PlantSearch::STRATA_SQL} = ?", strata) ]
      end
      found << [ "mellifere", candidates.where("'mellifere' = ANY(plant_species.eco_services)") ]
      found << [ "edible", candidates.where("plant_species.edible_rating >= 4") ]
      found
    end
end
