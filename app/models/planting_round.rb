# The two rounds of a planting season, as the phone walks them on the land:
# the plants of the design still to put in the ground (« tournée de
# plantation »), and in spring the take check (« tournée de reprise »): did
# each young plant break bud? The phone leads to them one by one; get_map
# tells the person's AI where the garden stands.
#
# A plant is checked once a spring, from the 1st of March, for its first two
# springs in the ground. A plant planted in a year nobody knows, or found
# dead at its last check, is left out.
class PlantingRound
  TAKE_FROM_MONTH = 3
  # The months the phone offers the take round: from bud break to the end of
  # the first summer, when a plant that did not take is plain to see.
  TAKE_MONTHS = (3..9)
  TAKE_SPRINGS = 2

  attr_reader :map, :today

  def self.take_since(today = Date.current)
    Date.new(today.month >= TAKE_FROM_MONTH ? today.year : today.year - 1, TAKE_FROM_MONTH, 1)
  end

  def initialize(map, today: Date.current)
    @map = map
    @today = today
  end

  def since = self.class.take_since(today)
  def open? = TAKE_MONTHS.cover?(today.month)

  def plants
    map.features.active.where(kind: PlantableFeature::PLANT)
  end

  def to_plant
    plants.where("COALESCE(map_features.properties->>'planted_on', '') = ''")
  end

  # The plants whose take is still to check this spring.
  def take_due
    dated = plants
      .where("map_features.properties->>'planted_on' ~ '^\\d{4}-\\d{2}-\\d{2}'")
      .where("COALESCE(map_features.properties->>'planted_on_precision', '') <> 'unknown'")
      .where("(map_features.properties->>'planted_on')::date < ? AND (map_features.properties->>'planted_on')::date >= ?", since, since - TAKE_SPRINGS.years)
    dated.where.not(id: follow_ups.where(observed_on: since..).select(:map_feature_id))
         .where.not(id: latest.select { _2[:survival] == "dead" }.keys)
  end

  # Each plant's latest take check, by plant id: { observed_on:, survival: }.
  def latest
    @latest ||= follow_ups.latest_per_plant.pluck(:map_feature_id, :observed_on, :survival)
      .to_h { |id, on, survival| [ id, { observed_on: on, survival: } ] }
  end

  # What the phone needs: the plants to lead to, with their last check.
  def take_json
    {
      since: since.iso8601, open: open?,
      due: take_due.order(:id).pluck(:id).map do |id|
        last = latest[id]
        { id:, lastObservedOn: last&.dig(:observed_on)&.iso8601, lastSurvival: last&.dig(:survival) }
      end
    }
  end

  # For get_map: where the season stands, in counts.
  def as_json(*)
    checked = follow_ups.where(observed_on: since..).latest_per_plant.group(:survival).count
    {
      to_plant: to_plant.count,
      planted_this_season: plants.where("map_features.properties->>'planted_on' ~ '^\\d{4}-\\d{2}-\\d{2}'")
        .where("COALESCE(map_features.properties->>'planted_on_precision', '') = ''")
        .where("(map_features.properties->>'planted_on')::date >= ?", planting_season_start).count,
      take: {
        since: since.iso8601, open: open?, due: take_due.count,
        checked: PlantObservation::SURVIVALS.index_with { checked[_1].to_i }
      }
    }
  end

  private
    def follow_ups
      PlantObservation.where(map_feature_id: plants.select(:id), kind: "follow_up")
    end

    # Planting goes from autumn to the end of winter: this season began on
    # the 1st of July before today.
    def planting_season_start
      Date.new(today.month >= 7 ? today.year : today.year - 1, 7, 1)
    end
end
