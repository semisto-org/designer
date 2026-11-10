module Mcp
  module Tools
    # The terrain seen from the air in one of the region's flights (from
    # 1971 in Wallonia), as an image to look at: to compare the place
    # through the decades (hedges, orchards, ponds and paths that went, a
    # wood that grew) or read its vegetation in false colour infrared.
    class GetAerialPhoto < Base
      MAX_SIDE = 1024
      # Around the outline, so the neighbourhood (a hedge on the boundary, the
      # stream below) shows too.
      MARGIN = 0.15
      MIN_SPAN_M = 120
      INK = [ 255, 214, 0 ].freeze

      arguments(
        properties: {
          map_id: { type: "integer", minimum: 1, description: :map_id },
          photo: { type: "string", description: :photo },
          infrared: { type: "boolean", description: :infrared }
        },
        required: %w[map_id]
      )
      hints(open_world: true)

      def perform(map_id:, photo: nil, infrared: false)
        map = find_map!(map_id)
        layers = PhotoArchive.layers(map.region)
        raise ToolError, t("errors.no_aerial_photos") if layers.empty?

        layer = pick(layers, photo, infrared)
        bbox = frame(map) or raise ToolError, t("errors.no_outline")
        width, height = size(bbox)
        @image = begin
          outlined(PhotoArchive::Snapshot.call(layer, bbox, width:, height:), map, bbox, width, height)
        rescue Providers::GeoHttp::Error, Vips::Error => e
          Rails.logger.warn("[mcp] aerial photo #{layer.key}: #{e.class}: #{e.message}")
          raise ToolError, t("errors.aerial_photo_unavailable")
        end
        uncovered = layer.partial_coverage? && PhotoArchive::Coverage.uncovered(map).include?(layer.key)
        {
          photo: layer.key, name: layer.name, label: layer.option(:vintage).presence || layer.name,
          year: layer.option(:year), season: layer.option(:season), infrared: layer.infrared?,
          description: layer.description, attribution: ActionController::Base.helpers.strip_tags(layer.attribution.to_s).squish,
          covers_map: (false if uncovered), size_px: [ width, height ], outline: (t("tools.get_aerial_photo.outline") if map.boundary),
          extent_m: extent_m(bbox, map), north_up: true,
          note: t("tools.get_aerial_photo.note"),
          other_photos: PhotoArchive.vintages(map.region).map { |v| v.slice(:key, :label, :year, :season, :infrared_key) }
        }.compact
      end

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

        # The map's outline (or its center) in EPSG:3857, with a margin, square enough to read.
        def frame(map)
          west, south, east, north = map.bbox || (map.center && [ map.center.x, map.center.y, map.center.x, map.center.y ])
          return nil unless west

          x0, y0 = PhotoArchive.mercator(west, south)
          x1, y1 = PhotoArchive.mercator(east, north)
          scale = 1 / Math.cos(map.center ? map.center.y * Math::PI / 180 : (south + north) * Math::PI / 360)
          min = MIN_SPAN_M * scale
          cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
          half_w = [ (x1 - x0) * (1 + MARGIN), min ].max / 2
          half_h = [ (y1 - y0) * (1 + MARGIN), min ].max / 2
          [ cx - half_w, cy - half_h, cx + half_w, cy + half_h ]
        end

        # The map's outline drawn in yellow on the photo, so the terrain stands
        # out from its surroundings.
        def outlined(jpeg, map, bbox, width, height)
          return jpeg unless map.boundary

          west, south, east, north = bbox
          to_px = lambda do |lon, lat|
            x, y = PhotoArchive.mercator(lon, lat)
            [ ((x - west) / (east - west) * width).round, ((north - y) / (north - south) * height).round ]
          end
          image = Vips::Image.new_from_buffer(jpeg, "")
          image = image.colourspace(:srgb) if image.bands < 3
          image = image.mutate do |canvas|
            map.boundary.each do |polygon|
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
        def extent_m(bbox, map)
          lat = map.center&.y || 50.0
          k = Math.cos(lat * Math::PI / 180)
          [ ((bbox[2] - bbox[0]) * k).round, ((bbox[3] - bbox[1]) * k).round ]
        end

        def content_for(data)
          super + [ { type: "image", data: Base64.strict_encode64(@image), mimeType: "image/jpeg" } ]
        end

        def summarize_result(data) = { photo: data[:photo] }
    end
  end
end
