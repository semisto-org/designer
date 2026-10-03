# An optional PostGIS point (`location`, SRID 4326) on a record: GeoJSON and
# lng/lat in and out, plus distance queries in meters on the geography type
# (backed by the expression index on `location::geography`).
module PointLocation
  extend ActiveSupport::Concern
  include GeoJsonGeometry

  included do
    scope :located, -> { where.not(location: nil) }
    scope :unlocated, -> { where(location: nil) }
    scope :within_meters_of_point, lambda { |lng, lat, meters|
      where("ST_DWithin(#{table_name}.location::geography, ST_SetSRID(ST_MakePoint(?, ?), 4326)::geography, ?)", lng.to_f, lat.to_f, meters.to_f)
    }
    validate :location_within_world
  end

  class_methods do
    # A GEOS point from longitude and latitude, nil when either is blank or
    # not a number.
    def point_from(lng, lat)
      return nil if lng.blank? || lat.blank?
      GeoJsonGeometry::FACTORY.point(Float(lng), Float(lat))
    rescue ArgumentError, TypeError
      nil
    end
  end

  # Accepts an RGeo point, a GeoJSON Point (Hash/String) or [lng, lat].
  def location=(value)
    value = case value
    when Array then self.class.point_from(value[0], value[1])
    when Hash, String, ActionController::Parameters then self.class.parse_geojson(value)
    else value
    end
    super(value)
  end

  def lng = location&.x
  def lat = location&.y
  def lnglat = location && [ location.x, location.y ]

  private
    def location_within_world
      return unless location
      errors.add(:location, :invalid) unless location.x.between?(-180, 180) && location.y.between?(-90, 90)
    end
end
