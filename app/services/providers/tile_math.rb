# Web Mercator tile arithmetic (XYZ scheme, the one MapLibre and Leaflet
# use). Tile coordinates do not depend on the tile's pixel size.
module Providers
  module TileMath
    ORIGIN = 20_037_508.342789244 # half the Web Mercator world width, in meters
    MAX_ZOOM = 24

    module_function

    def valid?(z, x, y)
      z.between?(0, MAX_ZOOM) && x.between?(0, (2**z) - 1) && y.between?(0, (2**z) - 1)
    end

    # [min_x, min_y, max_x, max_y] in EPSG:3857 meters.
    def bbox_3857(z, x, y)
      span = (2 * ORIGIN) / (2**z)
      min_x = -ORIGIN + (x * span)
      max_y = ORIGIN - (y * span)
      [ min_x, max_y - span, min_x + span, max_y ].map { |v| v.round(4) }
    end

    # [west, south, east, north] in degrees.
    def bbox_lnglat(z, x, y)
      n = 2.0**z
      west = (x / n * 360.0) - 180.0
      east = ((x + 1) / n * 360.0) - 180.0
      north = lat_of(y, n)
      south = lat_of(y + 1, n)
      [ west, south, east, north ]
    end

    def lat_of(y, n)
      Math.atan(Math.sinh(Math::PI * (1 - (2.0 * y / n)))) * 180.0 / Math::PI
    end

    def intersects?(a, b)
      a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1]
    end

    # Degrees per screen pixel at a MapLibre zoom (512 px world at zoom 0),
    # along longitude.
    def degrees_per_pixel(zoom)
      360.0 / (512 * (2**zoom.to_f))
    end
  end
end
