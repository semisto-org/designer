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

  def observed_at
    return nil unless storm_observation?

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
      p["observed_at"] = (created_at || Time.current).utc.iso8601 unless storm_time?(p["observed_at"])
      self.properties = p
    end

    def storm_time?(value)
      value.is_a?(String) && Time.iso8601(value).present?
    rescue ArgumentError
      false
    end
end
