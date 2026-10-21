# A sign of the season noted on the land (`kind: season_sign`, layer notes),
# from the phone's « carnet des saisons »: the first frost, where frost
# lingers, where the snow melts first, the puddles after rain, an animal's
# path, a nest… A point where the person stood, the sign (validated by the
# element library) and when it was seen. Read by the AI through
# `get_season_signs`.
module MapFeature::SeasonSign
  extend ActiveSupport::Concern

  SIGN_KIND = "season_sign".freeze
  SEASONS = %w[winter spring summer autumn].freeze

  # The year of observation: what was seen on the land in each season of the
  # last twelve months (season signs, downpours, visit notes), and the seasons
  # never looked at, which a design should not take for granted; `current`
  # is the season one can go out and observe today.
  def self.observation_year(map, now: Time.current)
    features = map.features.active
    times = features.where(kind: [ SIGN_KIND, MapFeature::StormObservation::STORM_KIND ]).filter_map(&:observed_at) +
      features.where(layer: SiteVisit::NOTE_LAYER, kind: SiteVisit::NOTE_KIND).where("properties ? 'visit'")
        .pluck(Arel.sql("properties->>'taken_at'")).filter_map { |value| Time.iso8601(value.to_s) rescue nil }
    counts = times.select { |time| time.between?(now - 1.year, now + 1.day) }.map { |time| season_of(time) }.tally
    seasons = SEASONS.index_with { |season| counts[season].to_i }
    { seasons:, missing: seasons.select { |_season, count| count.zero? }.keys, current: season_of(now) }
  end

  def self.season_of(time) = SEASONS[(time.month % 12) / 3]

  included do
    before_validation :complete_season_sign, if: :season_sign?
  end

  def season_sign? = kind == SIGN_KIND

  private
    # Seen now, unless the phone said when (a frost noticed at noon was the morning's).
    def complete_season_sign
      p = (properties || {}).to_h.dup
      p["observed_at"] = observation_time(p["observed_at"]) || (created_at || Time.current).utc.iso8601
      self.properties = p
    end
end
