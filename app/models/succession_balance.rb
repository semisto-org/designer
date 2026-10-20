# How the forest garden's succession unfolds: support plants (nitrogen
# fixers, pioneers, biomass) against productive ones in years 1, 5, 15 and
# 30, from what is drawn on the map, and what the gardener has to do out
# there because of it (chop and drop this year, remove the support plants
# whose time has come). Read by the « Palette » panel and by the MCP.
#
# Years count from the garden's first planting, as the 3D growth does
# (Relief::GrowingPlants): a plant still to plant goes in today, a support
# plant leaves `support_until` years after its planting. A year is read in
# its middle. Only trees and shrubs count (the ratio is about the woody
# layers), and hedge and ornamental plants count on neither side.
class SuccessionBalance
  YEARS = [ 1, 5, 15, 30 ].freeze
  # Palette roles that are neither support nor production.
  NEITHER = %w[hedge ornamental].freeze
  WOODY = %w[canopy sub_canopy shrub].freeze
  # Semisto's rule of thumb for the start: one support plant for one or two
  # productive ones on a poor soil, one for three to five on a good soil
  # (design guide `soil`). Below this share in year 1, the companion says so.
  LOW_START = 0.2
  # Above this share in year 15, the support plants are still taking the light.
  HIGH_LATE = 0.4

  # `count`: how many plants the row stands for (a patch line holds many).
  Plant = Struct.new(:support, :start, :until, :planted, :training, :count, keyword_init: true)

  def initialize(map, quantities = map.planted_quantities, today: Date.current)
    @map = map
    @quantities = quantities
    @today = today
  end

  def as_json(*)
    plants = rows
    years = YEARS.map { |year| year_json(year, plants) }
    {
      origin: origin.iso8601,
      years:,
      supportTotal: plants.select(&:support).sum(&:count),
      productiveTotal: plants.reject(&:support).sum(&:count),
      actions: actions(plants),
      advice: advice(years)
    }
  end

  private
    attr_reader :map, :quantities, :today

    def features
      @features ||= map.features.where(kind: PlantableFeature::PLANT, status: "active").to_a
                       .select(&:plant_species_id)
    end

    # Year 0: the first planting, or today when nothing is planted yet.
    def origin
      @origin ||= [ features.filter_map(&:known_planted_on).min, today ].compact.min
    end

    def years_since_origin(date) = (date - origin).to_f / 365.25

    def rows
      points = features.filter_map do |feature|
        key = [ feature.plant_species_id, feature.plant_variety_id ]
        role = quantities.palette_role_for(key)
        support = feature.support_plant?(role)
        next if !support && NEITHER.include?(role)
        next unless WOODY.include?(quantities.strata_for(key))

        long_ago = feature.planted_on_precision == "unknown"
        start = long_ago ? -Float::INFINITY : years_since_origin(feature.known_planted_on || today)
        Plant.new(support:, start:, until: (feature.support_until if support && !long_ago),
                  planted: feature.planted?, training: feature.plant_training, count: 1)
      end
      points + patch_rows
    end

    # A patch's lines have no planting date: they go in today and stay.
    def patch_rows
      start = years_since_origin(today)
      quantities.patches.flat_map do |patch|
        patch.lines.flat_map do |line|
          role = quantities.palette_role_for(line.item.key)
          support = PlantableFeature::SUPPORT_ROLES.include?(role)
          next [] if (!support && NEITHER.include?(role)) || !WOODY.include?(line.strata) || line.quantity.to_i <= 0
          [ Plant.new(support:, start:, until: nil, planted: false, training: nil, count: line.quantity.to_i) ]
        end
      end
    end

    def year_json(year, plants)
      t = year - 0.5
      alive = plants.select { |p| p.start <= t && (p.until.nil? || p.start + p.until > t) }
      support = alive.select(&:support).sum(&:count)
      productive = alive.reject(&:support).sum(&:count)
      total = support + productive
      { year:, calendarYear: origin.year + year - 1, support:, productive:,
        share: total.zero? ? nil : (support.to_f / total).round(2) }
    end

    # What to do outside, this year: chop and drop the support plants in the
    # ground, remove those whose time has come.
    def actions(plants)
      now = years_since_origin(today)
      chop = plants.select { |p| p.support && p.planted && p.training == "chop_and_drop" && (p.until.nil? || p.start + p.until > now) }.sum(&:count)
      leaving = plants.select { |p| p.support && p.until && p.start.finite? }
                      .group_by { |p| (origin + ((p.start + p.until) * 365.25).round).year }
      give_way = leaving.select { |year, _| year.between?(today.year, today.year + 1) }
                        .map { |year, group| { year:, count: group.sum(&:count) } }.min_by { |g| g[:year] }
      unscheduled = plants.select { |p| p.support && p.until.nil? && p.training != "chop_and_drop" && p.start.finite? }.sum(&:count)
      [
        ({ key: "chop_and_drop", count: chop } if chop.positive?),
        ({ key: "give_way", count: give_way[:count], year: give_way[:year] } if give_way),
        ({ key: "unscheduled", count: unscheduled } if unscheduled.positive?)
      ].compact
    end

    def advice(years)
      first = years.first
      late = years.find { |y| y[:year] == 15 }
      [
        ("no_support" if first[:support].zero? && first[:productive].positive?),
        ("few_support" if first[:support].positive? && first[:share] && first[:share] < LOW_START),
        ("support_stays" if late[:share] && late[:share] > HIGH_LATE)
      ].compact
    end
end
