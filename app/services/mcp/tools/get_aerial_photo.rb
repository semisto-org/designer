module Mcp
  module Tools
    # The terrain seen from the air in one of the region's flights (from
    # 1971 in Wallonia), as an image to look at: to compare the place
    # through the decades (hedges, orchards, ponds and paths that went, a
    # wood that grew) or read its vegetation in false colour infrared.
    #
    # On a map or a territory: the whole place by default, or a square of
    # span_m metres around a point (lng, lat) in it, to look closer at one
    # spot of a commune.
    class GetAerialPhoto < Base
      include PlaceAccess

      MAX_SIDE = 1024
      MAX_SPAN_M = 5000
      DEFAULT_SPAN_M = 400
      # A point may lie this far from a map's outline.
      MAX_DISTANCE_M = 1000
      # Around the outline, so the neighbourhood (a hedge on the boundary, the
      # stream below) shows too.
      MARGIN = 0.15
      MIN_SPAN_M = 120
      INK = [ 255, 214, 0 ].freeze

      arguments(
        properties: {
          map_id: { type: "integer", minimum: 1, description: :map_id },
          territory_id: { type: "integer", minimum: 1, description: :territory_id },
          photo: { type: "string", description: :photo },
          infrared: { type: "boolean", description: :infrared },
          lng: { type: "number", minimum: -180, maximum: 180, description: :lng },
          lat: { type: "number", minimum: -90, maximum: 90, description: :lat },
          span_m: { type: "integer", minimum: MIN_SPAN_M, maximum: MAX_SPAN_M, description: :span_m }
        }
      )
      hints(open_world: true)

      def perform(map_id: nil, territory_id: nil, photo: nil, infrared: false, lng: nil, lat: nil, span_m: nil)
        place = find_place!(map_id, territory_id)
        region = require_region!(place)
        raise ToolError, t("tools.get_aerial_photo.point_needs_both") if lng.nil? != lat.nil?
        raise ToolError, t("tools.get_aerial_photo.span_needs_point") if span_m && lng.nil?
        require_point_near!(place, lng, lat, MAX_DISTANCE_M) if lng

        layers = PhotoArchive.layers(region)
        raise ToolError, t("errors.no_aerial_photos") if layers.empty?

        layer = pick(layers, photo, infrared)
        bbox = (lng ? square(lng, lat, span_m || DEFAULT_SPAN_M) : frame(place)) or raise ToolError, t("errors.no_outline")
        width, height = size(bbox)
        @image = begin
          outlined(PhotoArchive::Snapshot.call(layer, bbox, width:, height:), place, bbox, width, height)
        rescue Providers::GeoHttp::Error, Vips::Error => e
          Rails.logger.warn("[mcp] aerial photo #{layer.key}: #{e.class}: #{e.message}")
          raise ToolError, t("errors.aerial_photo_unavailable")
        end
        spot = lng ? Spot.new(GeoJsonGeometry::FACTORY.point(lng, lat), region) : place
        uncovered = layer.partial_coverage? && PhotoArchive::Coverage.uncovered(spot).include?(layer.key)
        outline_key = territory?(place) ? "outline_territory" : "outline"
        {
          photo: layer.key, name: layer.name, label: layer.option(:vintage).presence || layer.name,
          year: layer.option(:year), season: layer.option(:season), infrared: layer.infrared?,
          description: layer.description, attribution: ActionController::Base.helpers.strip_tags(layer.attribution.to_s).squish,
          covers_map: (false if uncovered), size_px: [ width, height ], outline: (t("tools.get_aerial_photo.#{outline_key}") if place.boundary),
          center: ([ lng, lat ] if lng), bbox: wgs84(bbox),
          extent_m: extent_m(bbox, lat || place.center&.y), north_up: true,
          note: t("tools.get_aerial_photo.note"),
          other_photos: PhotoArchive.vintages(region).map { |v| v.slice(:key, :label, :year, :season, :infrared_key) }
        }.compact
      end

      # Where a partial flight is judged when a point is asked for.
      Spot = Struct.new(:center, :region)

      private
        def pick(layers, key, infrared)
          layer = if key.present?
            layers.find { |l| l.key == key } or raise ToolError, t("errors.unknown_aerial_photo", key:, keys: layers.map(&:key).join(", "))
          else
            layers.find(&:default?) || layers.reject(&:infrared?).last
          end
          return layer unless infrared && !layer.infrared?

          layers.find { |l| l.option(:infrared_of) == layer.key } or raise ToolError, t("errors.no_infrared", label: layer.name)
        end

        # A square of `span_m` ground metres around a point, in EPSG:3857.
        def square(lng, lat, span_m)
          x, y = PhotoArchive.mercator(lng, lat)
          half = span_m / 2.0 / Math.cos(lat * Math::PI / 180)
          [ x - half, y - half, x + half, y + half ]
        end

        # [west, south, east, north] in WGS84, to place what the photo shows.
        def wgs84(bbox)
          west, north = Relief::Mercator.inverse(bbox[0], bbox[3])
          east, south = Relief::Mercator.inverse(bbox[2], bbox[1])
          [ west, south, east, north ].map { |v| v.round(6) }
        end

        # The place's outline (or its center) in EPSG:3857, with a margin, square enough to read.
        def frame(place)
          west, south, east, north = place.bbox || (place.center && [ place.center.x, place.center.y, place.center.x, place.center.y ])
          return nil unless west

          x0, y0 = PhotoArchive.mercator(west, south)
          x1, y1 = PhotoArchive.mercator(east, north)
          scale = 1 / Math.cos(place.center ? place.center.y * Math::PI / 180 : (south + north) * Math::PI / 360)
          min = MIN_SPAN_M * scale
          cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
          half_w = [ (x1 - x0) * (1 + MARGIN), min ].max / 2
          half_h = [ (y1 - y0) * (1 + MARGIN), min ].max / 2
          [ cx - half_w, cy - half_h, cx + half_w, cy + half_h ]
        end

        # The place's outline drawn in yellow on the photo, so the terrain (or
        # the commune) stands out from its surroundings.
        def outlined(jpeg, place, bbox, width, height)
          return jpeg unless place.boundary

          west, south, east, north = bbox
          to_px = lambda do |lon, lat|
            x, y = PhotoArchive.mercator(lon, lat)
            [ ((x - west) / (east - west) * width).round, ((north - y) / (north - south) * height).round ]
          end
          image = Vips::Image.new_from_buffer(jpeg, "")
          image = image.colourspace(:srgb) if image.bands < 3
          image = image.mutate do |canvas|
            place.boundary.each do |polygon|
              [ polygon.exterior_ring, *polygon.interior_rings ].each do |ring|
                ring.points.each_cons(2) do |a, b|
                  (x0, y0), (x1, y1) = to_px.(a.x, a.y), to_px.(b.x, b.y)
                  [ -1, 0, 1 ].each do |d|
                    canvas.draw_line!(INK, x0 + d, y0, x1 + d, y1)
                    canvas.draw_line!(INK, x0, y0 + d, x1, y1 + d)
                  end
                end
              end
            end
          end
          image.jpegsave_buffer(Q: 85, strip: true)
        end

        def size(bbox)
          w, h = bbox[2] - bbox[0], bbox[3] - bbox[1]
          w >= h ? [ MAX_SIDE, (MAX_SIDE * h / w).round.clamp(1, MAX_SIDE) ] : [ (MAX_SIDE * w / h).round.clamp(1, MAX_SIDE), MAX_SIDE ]
        end

        # Ground metres across and down the image (Web Mercator stretches with latitude).
        def extent_m(bbox, lat)
          k = Math.cos((lat || 50.0) * Math::PI / 180)
          [ ((bbox[2] - bbox[0]) * k).round, ((bbox[3] - bbox[1]) * k).round ]
        end

        def content_for(data)
          super + [ { type: "image", data: Base64.strict_encode64(@image), mimeType: "image/jpeg" } ]
        end

        def summarize_result(data) = { photo: data[:photo] }
    end
  end
end
