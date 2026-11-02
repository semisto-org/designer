module Sectors
  # The arc of a sector (sector analysis) around a terrain, as the editor
  # draws it (app/frontend/map/sectors/sectors.ts, sectorArc and arcRadius):
  # a LineString clockwise around the terrain's centre from `from_deg` to
  # `to_deg`, a point every 5° or so, a little outside the terrain. Bearings
  # are degrees clockwise from north; equal values go all around.
  #
  #   Sectors::Arc.for_map(map, from_deg: 300, to_deg: 40)
  #   # => { "type" => "LineString", "coordinates" => [[lng, lat], ...] }
  module Arc
    TYPES = %w[wind cold_wind fire flood frost noise dust pollution good_view bad_view privacy wildlife predators other].freeze
    SEASONS = %w[all_year winter summer].freeze
    # Soft field-notebook colours, the same as SECTOR_COLORS in sectors.ts.
    COLORS = {
      "wind" => "#8cc6c8", "cold_wind" => "#6ea2c8", "fire" => "#e4705e", "flood" => "#88a794",
      "frost" => "#a8c3dc", "noise" => "#9c9a96", "dust" => "#aaa7a2", "pollution" => "#8b7f6e",
      "good_view" => "#a3bb8a", "bad_view" => "#b49b89", "privacy" => "#c2a5c8", "wildlife" => "#7fb2c4",
      "predators" => "#8f8d8a", "other" => "#9b8fb5"
    }.freeze
    # 16 compass points, from N clockwise, as the editor writes them (French: O for ouest).
    COMPASS_POINTS = %w[N NNE NE ENE E ESE SE SSE S SSO SO OSO O ONO NO NNO].freeze
    AXIAL_TILT = 23.44
    METERS_PER_DEGREE = 111_320
    DEFAULT_RADIUS_M = 60

    module_function

    def normalize(deg) = deg.to_f % 360

    # Degrees swept clockwise from `from` to `to` (a whole turn when they meet).
    def sweep(from, to)
      span = normalize(to - from)
      span.zero? ? 360.0 : span
    end

    # The point at `meters` from `center` ([lng, lat]) towards `deg`.
    def destination(center, deg, meters)
      rad = deg * Math::PI / 180
      kx = Math.cos(center[1] * Math::PI / 180)
      [
        center[0] + Math.sin(rad) * meters / (METERS_PER_DEGREE * kx),
        center[1] + Math.cos(rad) * meters / METERS_PER_DEGREE
      ]
    end

    def geometry(center, radius_m, from, to)
      span = sweep(from, to)
      steps = [ 2, (span / 5).ceil ].max
      coordinates = (0..steps).map { |i| destination(center, from + span * i / steps, radius_m) }
      { "type" => "LineString", "coordinates" => coordinates }
    end

    # Half the bounding box's diagonal, plus 15 %, never under 15 m.
    def radius(bbox)
      return DEFAULT_RADIUS_M unless bbox
      w, s, e, n = bbox
      kx = Math.cos((s + n) / 2 * Math::PI / 180)
      half = Math.hypot((e - w) * kx, n - s) * METERS_PER_DEGREE / 2
      [ 15, (half * 1.15).round ].max
    end

    # Bearing from `center` to `point` ([lng, lat]), on the ground.
    def bearing(center, point)
      kx = Math.cos(center[1] * Math::PI / 180)
      normalize(Math.atan2((point[0] - center[0]) * kx, point[1] - center[1]) * 180 / Math::PI)
    end

    def compass_point(deg) = COMPASS_POINTS[(normalize(deg) / 22.5).round % 16]

    # The directions of a sector feature: those saved with it, else read
    # back from the two ends of its arc (sectors saved before them).
    def directions(feature, center)
      from, to = feature.properties&.values_at("from_deg", "to_deg")
      return [ normalize(from), normalize(to) ] if from.is_a?(Numeric) && to.is_a?(Numeric)
      points = feature.geometry.respond_to?(:points) ? feature.geometry.points : []
      return nil if points.size < 2
      [ points.first, points.last ].map { |p| bearing(center, [ p.x, p.y ]).round }
    end

    # Where the sun rises and sets at the summer and winter solstices
    # (cos A = sin δ / cos φ, flat horizon), as sunSectors in sectors.ts:
    # the summer sun sweeps from the north-east through the south to the
    # north-west, the winter sun only across the south. None above the polar circles.
    def sun(latitude)
      north = latitude >= 0
      { "summer_sun" => north ? AXIAL_TILT : -AXIAL_TILT, "winter_sun" => north ? -AXIAL_TILT : AXIAL_TILT }.filter_map do |type, declination|
        c = Math.sin(declination * Math::PI / 180) / Math.cos(latitude * Math::PI / 180)
        next if c.abs > 1
        rise = (Math.acos(c) * 180 / Math::PI).round
        from, to = north ? [ rise, 360 - rise ] : [ 360 - rise, rise ]
        { type:, from_deg: from, to_deg: to }
      end
    end

    # The arc around the map's terrain (its centre is the outline's centroid).
    def for_map(map, from_deg:, to_deg:)
      geometry([ map.center.x, map.center.y ], radius(map.bbox), from_deg.to_f, to_deg.to_f)
    end
  end
end
