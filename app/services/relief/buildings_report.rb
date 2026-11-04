# The buildings standing on and around a map's place, in figures, for an AI
# (MCP get_site_data, topic `buildings`): what casts shade on the garden,
# from where and how high. Where the region publishes its buildings in 3D
# (Providers::BuildingModels, Brussels), heights and roofs are measured;
# elsewhere they come from OpenStreetMap's tags, when there are any.
#
# The extent is the 3D relief's when it is imported, else the boundary's box
# with MARGIN_M around it. The NEAREST buildings come first.
module Relief
  class BuildingsReport
    MARGIN_M = 80
    NEAREST = 30
    # A roof slope under ~8° reads as flat.
    FLAT_COS = Math.cos(8 * Math::PI / 180)
    COMPASS = %w[N NE E SE S SW W NW].freeze

    def initialize(map)
      @map = map
    end

    def as_json(*)
      bounds = extent
      return { available: false, reason: "no_boundary" } unless bounds

      @origin = centre
      models = models_within(bounds)
      footprints = models&.any? ? [] : footprints_within(bounds)
      buildings = (models || []) + footprints
      return { available: false, reason: "unavailable" } if models.nil? && footprints.nil?

      {
        available: true,
        source: models&.any? ? "region_3d_model" : "openstreetmap",
        attribution: models&.any? ? @models_attribution : Providers::Buildings::ATTRIBUTION,
        count: buildings.size,
        nearest: buildings.sort_by { _1[:distance_m] }.first(NEAREST)
      }
    end

    private
      def extent
        return @map.terrain.bounds if @map.terrain&.ready?

        box = @map.bbox or return nil
        dlat = MARGIN_M / 111_320.0
        dlng = dlat / Math.cos((box[1] + box[3]) / 2 * Math::PI / 180)
        { south: box[1] - dlat, west: box[0] - dlng, north: box[3] + dlat, east: box[2] + dlng }
      end

      def centre
        point = @map.boundary&.centroid || @map.center
        point && [ point.x, point.y ]
      end

      def models_within(bounds)
        provider = Providers::BuildingModels.for(@map.region) or return nil
        @models_attribution = provider.attribution
        provider.within(**bounds).map do |model|
          gutters = model.roofs.map { |polygon| polygon.first.map(&:last).min }
          place(model.rings.first).merge(source: "region_3d_model", height_m: model.height.round(1),
                                         eaves_m: gutters.min.round(1), roof: roof_kind(model.roofs), roof_surfaces: model.roofs.size)
        end
      rescue Providers::BuildingModels::Unavailable
        nil
      end

      def footprints_within(bounds)
        provider = Providers::Buildings.build
        return nil unless provider.available?

        provider.within(**bounds).map do |building|
          place(building.rings.first).merge(source: "openstreetmap", kind: building.kind, height_m: building.height, levels: building.levels).compact
        end
      rescue Providers::Buildings::Unavailable
        nil
      end

      # Where a footprint stands from the place's centre: centre, distance, direction.
      def place(ring)
        points = ring.first == ring.last ? ring[0...-1] : ring
        lng = points.sum(&:first) / points.size
        lat = points.sum(&:last) / points.size
        return { centroid: [ lng.round(6), lat.round(6) ] } unless @origin

        dx = (lng - @origin[0]) * 111_320 * Math.cos(@origin[1] * Math::PI / 180)
        dy = (lat - @origin[1]) * 111_320
        bearing = (Math.atan2(dx, dy) * 180 / Math::PI) % 360
        { centroid: [ lng.round(6), lat.round(6) ], distance_m: Math.hypot(dx, dy).round, direction: COMPASS[((bearing + 22.5) / 45).floor % 8] }
      end

      # The roof as a simple shape, from its surfaces' slopes and facings
      # (same reading as the 3D view's « Régler son toit »).
      def roof_kind(roofs)
        facings = roofs.filter_map do |(outer, *)|
          nx, ny, nz = normal(outer)
          next if nz.abs >= FLAT_COS

          ((Math.atan2(nx, ny) / (Math::PI / 2)).round % 4 + 4) % 4
        end
        return "flat" if facings.empty?

        { 1 => "shed", 2 => "pitched" }.fetch(facings.uniq.size, "hip")
      end

      # Newell's normal of a polygon of [lng, lat, h], in local metres.
      def normal(ring)
        lat0 = ring.first[1]
        k = Math.cos(lat0 * Math::PI / 180)
        points = ring.map { |lng, lat, h| [ lng * 111_320 * k, lat * 111_320, h ] }
        nx = ny = nz = 0.0
        points.each_cons(2) do |(ax, ay, ah), (bx, by, bh)|
          nx += (ay - by) * (ah + bh)
          ny += (ah - bh) * (ax + bx)
          nz += (ax - bx) * (ay + by)
        end
        length = Math.sqrt(nx**2 + ny**2 + nz**2)
        length.zero? ? [ 0.0, 0.0, 1.0 ] : [ nx / length, ny / length, nz / length ]
      end
  end
end
