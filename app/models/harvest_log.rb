# The harvest log of a map, season after season: which plants bore fruit,
# which were picked and where the fruit went, and which plants have given
# nothing for several seasons (to think about renewing them).
#
# Plants listed: the fruit and nut plants in the ground (trees, shrubs and
# climbers whose species gives fruit or seeds, or whose edible parts are
# unknown, and marked as planted), plus any plant that already has a
# harvest line. A plant still to plant has nothing to pick yet.
#
# A season counts as « followed » once someone noted at least one line on
# the map that year: in a followed season, a plant with nothing noted gave
# nothing that anyone picked or saw. Old varieties often bear one year in
# two (alternance), so a plant is « à surveiller » only after
# WATCH_SEASONS followed seasons in a row without fruit.
class HarvestLog
  WOODY_STRATA = %w[canopy sub_canopy shrub vine].freeze
  FRUIT_PARTS = %w[fruit seed].freeze
  WATCH_SEASONS = 3
  # Seasons shown side by side, ending with the current one.
  SHOWN_SEASONS = 5

  attr_reader :map, :season

  def initialize(map, season: Date.current.year)
    @map = map
    @season = season.to_i
  end

  def self.harvestable_species?(species)
    return false unless species
    WOODY_STRATA.include?(species.strata) && (species.edible_parts.empty? || species.edible_parts.intersect?(FRUIT_PARTS))
  end

  def seasons = ((season - SHOWN_SEASONS + 1)..season).to_a

  # Years with at least one line on the map, up to the season shown.
  def followed_seasons
    @followed_seasons ||= harvests.map(&:season).uniq.select { _1 <= season }.sort
  end

  def plants
    @plants ||= begin
      by_plant = harvests.group_by(&:map_feature_id)
      candidates.filter_map do |feature|
        lines = by_plant.fetch(feature.id, [])
        species = species_by_id[feature.plant_species_id]
        next unless lines.any? || (feature.planted? && self.class.harvestable_species?(species))
        row(feature, species, varieties_by_id[feature.plant_variety_id], lines)
      end.sort_by { [ _1[:speciesName].to_s, _1[:varietyName].to_s, _1[:name].to_s, _1[:featureId] ] }
    end
  end

  # The season in numbers.
  def totals
    statuses = plants.map { _1[:seasons][season]&.dig(:status) }
    lines = harvests.select { _1.season == season && _1.picked? }
    {
      plants: plants.size,
      picked: statuses.count("picked"), bore: statuses.count("bore"), none: statuses.count("none"),
      unnoted: statuses.count(nil),
      quantityKg: lines.sum { _1.quantity_kg.to_f }.round(1).then { _1.zero? ? nil : _1 },
      uses: PlantHarvest::USES.index_with { |use| lines.count { _1.uses.include?(use) } }.select { |_, n| n.positive? },
      watch: plants.count { _1[:watch] }
    }
  end

  def as_json(*)
    {
      season:, seasons:, followedSeasons: followed_seasons, watchSeasons: WATCH_SEASONS,
      totals:, plants: plants.map { _1.merge(seasons: _1[:seasons].transform_keys(&:to_s)) },
      varieties:
    }
  end

  # « Que faire de chaque variété ? »: the varieties of the listed plants,
  # what each is good for and how long it keeps, and what this place did
  # with it so far (uses of its harvest lines, all seasons up to this one).
  def varieties
    counts = plants.filter_map { _1[:varietyId] }.tally
    picked = harvests.select(&:picked?).group_by(&:variety_id)
    counts.map do |id, count|
      variety = varieties_by_id[id]
      lines = picked.fetch(id, [])
      variety.uses_json.merge(
        speciesName: species_by_id[variety.species_id]&.then { _1.common_name || _1.latin_name },
        plants: count,
        here: PlantHarvest::USES.index_with { |use| lines.count { _1.uses.include?(use) } }.select { |_, n| n.positive? }
      )
    end.sort_by { [ _1[:speciesName].to_s, _1[:name].to_s ] }
  end

  # One plant's line, for its sheet (nil when the plant is not on the map).
  def plant(feature_id) = plants.find { _1[:featureId] == feature_id }

  private
    def harvests
      @harvests ||= map.plant_harvests.where(noted_on: ..Date.new(season, 12, 31)).chronological.to_a
    end

    def candidates
      @candidates ||= map.features.active.where(kind: PlantableFeature::PLANT).to_a
    end

    def species_by_id
      @species_by_id ||= PlantSpecies.includes(:common_names).where(id: candidates.map(&:plant_species_id).compact.uniq).index_by(&:id)
    end

    def varieties_by_id
      @varieties_by_id ||= PlantVariety.includes(:common_names, :field_sources).where(id: candidates.map(&:plant_variety_id).compact.uniq).index_by(&:id)
    end

    def row(feature, species, variety, lines)
      by_season = lines.group_by(&:season).transform_values { season_summary(_1) }
      bearing_from = bearing_from(feature, species, variety)
      quiet = quiet_seasons(by_season, bearing_from)
      {
        featureId: feature.id, name: feature.name, number: feature.properties["number"],
        speciesId: species&.id, speciesName: species&.common_name || species&.latin_name,
        varietyId: variety&.id, varietyName: variety&.name,
        plantedOn: feature.planted_on&.iso8601, bearingFrom: bearing_from,
        seasons: by_season.slice(*seasons),
        lastBore: by_season.select { |_, s| s[:status] != "none" }.keys.max,
        lastNotedOn: lines.map(&:noted_on).max&.iso8601,
        quietSeasons: quiet, watch: quiet >= WATCH_SEASONS
      }
    end

    # What a plant did in one season: picked (any harvest line), bore (fruit
    # seen on the tree) or none (looked at, nothing on it).
    def season_summary(lines)
      picked = lines.select(&:picked?)
      status = if picked.any? then "picked"
      elsif lines.any?(&:bore?) then "bore"
      else "none"
      end
      amounts = lines.map(&:amount).compact
      {
        status:, amount: amounts.max_by { PlantHarvest::AMOUNTS.index(_1) },
        uses: picked.flat_map(&:uses).uniq,
        quantityKg: picked.sum { _1.quantity_kg.to_f }.round(1).then { _1.zero? ? nil : _1 }
      }
    end

    # First season a young plant is expected to bear: planting year plus
    # the variety's (else the species') years to first fruit.
    def bearing_from(feature, species, variety)
      years = variety&.production_start_year || species&.production_start_year
      planted = feature.known_planted_on
      planted && years ? planted.year + years : nil
    end

    # Followed seasons in a row, ending with the latest, without any fruit
    # seen or picked; seasons before the plant could bear do not count.
    def quiet_seasons(by_season, bearing_from)
      followed_seasons.reverse.take_while { |year| by_season[year].nil? || by_season[year][:status] == "none" }
                      .count { |year| bearing_from.nil? || year >= bearing_from }
    end
end
