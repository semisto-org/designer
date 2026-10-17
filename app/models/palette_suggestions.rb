# Species to suggest for a map's palette when the designer has not searched
# yet, first those that fill what the palette lacks (a nitrogen fixer, a
# missing strata, melliferous plants).
#
# Known facts rule a species out (less hardy than the zone, invasive in the
# country, toxic for the project's animals: PlantFit::Site#excluded_by); a
# species whose hardiness is unknown stays, marked « ? ». Inside each need,
# species are ranked by their PlantFit tier (fits everywhere the site can be
# judged, then fits with unknowns, then one misfit), natives first.
class PaletteSuggestions
  LIMIT = 8
  PER_NEED = 3
  POOL = 60
  KEY_STRATA = %w[sub_canopy shrub herbaceous ground_cover].freeze

  Suggestion = Data.define(:species, :reason, :fit) do
    def as_json(*) = species.summary_json.merge(reason:, fit: fit.as_json)
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
        ranked(scope.where.not(id: taken)).first(PER_NEED).each { |species, fit| chosen << Suggestion.new(species:, reason:, fit:) }
      end
      chosen.first(@limit)
    end
  end

  def site = @site ||= PlantFit::Site.new(@map)

  # How many reviewed species each known fact rules out, so the person sees
  # what was left aside and why.
  def excluded
    scope = PlantSpecies.reviewed
    zone = site.zone
    country = site.country
    {
      hardiness: zone ? scope.where("plant_species.hardiness_zone > ?", zone).count : 0,
      invasive: country ? scope.where("? = ANY(plant_species.invasive_countries)", country).count : 0,
      toxic: site.toxic_for.any? ? scope.where("plant_species.toxic_for && ARRAY[?]::varchar[]", site.toxic_for).count : 0
    }
  end

  def as_json(*) = { suggestions: suggestions.map(&:as_json), zone: @map.hardiness_zone, site: site.as_json, excluded: }

  private
    # [[species, fit]] of a need, best tier first; a species with more than
    # one misfit is not suggested.
    def ranked(scope)
      scope.limit(POOL).includes(:field_sources).to_a.each_with_index.filter_map do |species, index|
        next if site.excluded_by(species)
        fit = site.fit(species)
        [ species, fit, index ] unless fit.tier == "misfits"
      end.sort_by { |_, fit, index| [ fit.rank, index ] }.map { |species, fit, _| [ species, fit ] }
    end

    def palette_species
      @palette_species ||= PlantSpecies.where(id: @map.palette_items.select(:species_id)).to_a
    end

    def candidates
      scope = PlantSpecies.reviewed.where.not(id: palette_species.map(&:id)).with_card_data
      zone = @map.hardiness_zone
      scope = scope.where("plant_species.hardiness_zone IS NULL OR plant_species.hardiness_zone <= ?", zone) if zone
      scope = scope.where.not("plant_species.toxic_for && ARRAY[?]::varchar[]", site.toxic_for) if site.toxic_for.any?
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
