# A line that carries water (pipe, ditch, swale, irrigation line: the kinds
# marked `links: true` in config/map_elements.yml) knows the elements it
# leaves and reaches: `properties.from_id` at its first point, `to_id` at its
# last one. The person draws as usual: an end drawn within SNAP_M of a tank,
# a pond, a roof, a paddock… snaps to it, and the inspector lets them change
# it. Reshaping the line reads its ends again, unless the same save names
# them; a blank value says « connected to nothing ».
#
# WaterLinks::Report turns a link into the drop between its ends (a tank's
# height above ground plus the slope), hence the pressure at the outlet.
module MapFeature::WaterLinks
  extend ActiveSupport::Concern

  SNAP_M = 2.0
  ENDS = { "from_id" => :start_point, "to_id" => :end_point }.freeze
  # Where storage and distribution elements live (a roof, a tank, a pond, a
  # raised bed, a paddock, a tap). Plants and annotations are not endpoints.
  ENDPOINT_LAYERS = %w[existing water structures animals networks].freeze
  ENDPOINT_GEOMETRIES = %w[ST_Point ST_Polygon ST_MultiPolygon].freeze

  included do
    before_validation :snap_water_link_ends
    validate :water_link_ends_on_map
  end

  class_methods do
    # Elements of the map a link can start from or end at, nearest first to
    # a point (lng, lat) when given.
    def water_link_endpoints(map, near: nil, within: nil, except: nil)
      scope = map.features.where.not(status: "rejected").where(layer: ENDPOINT_LAYERS)
        .where.not(kind: MapElements.link_kinds)
        .where("ST_GeometryType(map_features.geometry) IN (?)", ENDPOINT_GEOMETRIES)
      scope = scope.where.not(id: except) if except
      return scope unless near

      point = sanitize_sql_array([ "ST_SetSRID(ST_MakePoint(?, ?), 4326)::geography", *near.map(&:to_f) ])
      scope = scope.where("ST_DWithin(map_features.geometry::geography, #{point}, ?)", within) if within
      scope.order(Arel.sql("ST_Distance(map_features.geometry::geography, #{point})"))
    end
  end

  def water_link? = MapElements.link_kinds.include?(kind)

  # Ids of the elements at each end (nil: none).
  def water_link_from_id = water_link_end("from_id")
  def water_link_to_id = water_link_end("to_id")

  # [lng, lat] of the line's first or last point.
  def water_link_point(key)
    return nil unless geometry.respond_to?(:start_point)
    point = geometry.public_send(ENDS.fetch(key))
    [ point.x, point.y ]
  end

  private
    def water_link_end(key)
      value = properties.to_h[key]
      Integer(value.to_s, exception: false) if value.present?
    end

    def snap_water_link_ends
      return unless map && geometry && water_link?

      before = new_record? ? {} : (attribute_in_database(:properties) || {})
      reshaped = new_record? || will_save_change_to_geometry?
      self.properties = (properties || {}).to_h.deep_stringify_keys
      ENDS.each_key do |key|
        named = new_record? ? properties.key?(key) : before[key] != properties[key]
        if named
          properties.delete(key) if properties[key].blank?
        elsif reshaped
          found = self.class.water_link_endpoints(map, near: water_link_point(key), within: SNAP_M, except: id).pick(:id)
          found ? properties[key] = found : properties.delete(key)
        end
      end
    end

    def water_link_ends_on_map
      return unless water_link?

      ENDS.each_key do |key|
        next if properties.to_h[key].blank?
        id = water_link_end(key)
        next if id && id != self.id && map && self.class.water_link_endpoints(map).exists?(id:)
        errors.add(:base, :water_link, message: I18n.t("water_links.errors.unknown_end"))
      end
    end
end
