# An observation made during a downpour (`kind: storm_observation`): where
# the water ran (a line drawn downstream), where it stood (a surface) or
# where it came out of the ground (a point), with the time it was seen.
# Relief::StormCheck compares it with what the relief predicts.
module MapFeature::StormObservation
  extend ActiveSupport::Concern

  STORM_KIND = "storm_observation".freeze
  WATER_BY_GEOMETRY = { "Point" => "seeps", "LineString" => "flows", "Polygon" => "pools" }.freeze

  included do
    before_validation :complete_storm_observation, if: :storm_observation?
  end

  # What the water did, from the shape that was drawn.
  def self.water_for(geometry)
    WATER_BY_GEOMETRY[geometry&.geometry_type&.type_name]
  end

  def storm_observation? = kind == STORM_KIND

  # When it was seen; season signs (MapFeature::SeasonSign) carry the same time.
  def observed_at
    return nil unless storm_observation? || season_sign?

    Time.iso8601(properties.to_h["observed_at"].to_s)
  rescue ArgumentError
    nil
  end

  private
    # The water follows the shape (a line runs, a surface stands, a point
    # seeps); the time defaults to now, the moment it is noted.
    def complete_storm_observation
      p = (properties || {}).to_h.dup
      p["water"] = MapFeature::StormObservation.water_for(geometry) if geometry && MapFeature::StormObservation.water_for(geometry)
      p["observed_at"] = observation_time(p["observed_at"]) || (created_at || Time.current).utc.iso8601
      self.properties = p
    end

    # The time it was seen, as ISO 8601: a full time is kept as it is; a day
    # alone (« 2025-01-12 », « 12/01/2025 », as an AI or a person writes it)
    # becomes that morning, 08:00 UTC, as the phone records a sign seen a day
    # or two back. nil when there is no usable time.
    def observation_time(value)
      return unless value.is_a?(String) && value.present?
      text = value.strip
      Time.iso8601(text)
      text
    rescue ArgumentError
      day = observation_day(text)
      "#{day.iso8601}T08:00:00Z" if day
    end

    def observation_day(text)
      if text.match?(/\A\d{4}-\d{2}-\d{2}\z/) then Date.iso8601(text)
      elsif text.match?(%r{\A\d{1,2}/\d{1,2}/\d{4}\z}) then Date.strptime(text, "%d/%m/%Y")
      end
    rescue ArgumentError
      nil
    end
end
