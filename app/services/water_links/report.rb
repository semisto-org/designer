# What a water link (pipe, ditch, swale…) connects and how much water falls
# along it: the drop from the water's surface at the start (ground under the
# line's first point + the start element's height above ground, an IBC on a
# 2 m stand) to the outlet (ground under its last point + the end element's
# own height), hence the static pressure at the outlet, 0.098 bar per metre.
#
# The ground comes from the map's relief (MapTerrain) when it is imported and
# the plan covers analyses; without it, only the heights above ground count,
# and the report says so (`relief: false`). Friction in the pipe is not
# counted: an order of magnitude to choose drip or a pump, not a pipe sizing.
#
# For any other element (a tank, a pond), `links` lists the lines that leave
# it or reach it.
module WaterLinks
  class Report
    BAR_PER_M = 0.0981
    ABOVE_GROUND = "above_ground_m".freeze

    def initialize(map, feature, editor: true)
      @map = map
      @feature = feature
      @editor = editor
    end

    def self.applies?(feature, map) = feature.water_link? || links_of(feature, map).exists?

    def self.links_of(feature, map)
      map.features.where.not(status: "rejected").where(kind: MapElements.link_kinds)
        .where("map_features.properties->>'from_id' = :id OR map_features.properties->>'to_id' = :id", id: feature.id.to_s)
    end

    def as_json(*)
      @feature.water_link? ? link_json : { links: links_json }
    end

    private
      def link_json
        from = endpoint(@feature.water_link_from_id)
        to = endpoint(@feature.water_link_to_id)
        start_ground = ground(@feature.water_link_point("from_id"))
        end_ground = ground(@feature.water_link_point("to_id"))
        relief = !start_ground.nil? && !end_ground.nil?
        top = (relief ? start_ground : 0) + above_ground(from)
        outlet = (relief ? end_ground : 0) + above_ground(to)
        drop = (top - outlet).round(2)
        {
          from: from && endpoint_json(from), to: to && endpoint_json(to),
          relief:, startGroundM: start_ground&.round(2), endGroundM: end_ground&.round(2),
          slopeDropM: relief ? (start_ground - end_ground).round(2) : nil,
          dropM: from || relief ? drop : nil,
          pressureBar: (from || relief) && drop.positive? ? (drop * BAR_PER_M).round(2) : nil
        }
      end

      def links_json
        self.class.links_of(@feature, @map).filter_map do |link|
          next if link.layer == "networks" && !@editor
          { id: link.id, kind: link.kind, label: label(link), direction: link.water_link_from_id == @feature.id ? "out" : "in",
            other: endpoint_json_or_nil(link.water_link_from_id == @feature.id ? link.water_link_to_id : link.water_link_from_id) }
        end
      end

      def endpoint(id)
        return nil unless id
        feature = MapFeature.water_link_endpoints(@map).find_by(id:)
        feature = nil if feature&.layer == "networks" && !@editor
        feature
      end

      def endpoint_json_or_nil(id) = endpoint(id)&.then { endpoint_json(_1) }

      def endpoint_json(feature)
        { id: feature.id, kind: feature.kind, label: label(feature), aboveGroundM: above_ground(feature) }
      end

      def label(feature) = feature.name.presence || MapElements.label(feature.kind)

      def above_ground(feature)
        value = feature&.properties.to_h[ABOVE_GROUND]
        value.is_a?(Numeric) && value.positive? ? value.to_f : 0.0
      end

      def ground(point)
        return nil unless point && heights
        heights.at(*point)
      end

      def heights
        return @heights if defined?(@heights)
        terrain = @map.terrain
        @heights = terrain&.ready? && terrain.grid.attached? && Entitlements.for_map(@map).analyses? ? Relief::Heights.new(terrain) : nil
      end
  end
end
