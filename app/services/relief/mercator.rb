# Ported from Claudy (MIT, © 2022-2023 Fondation Les 4 Sources)
module Relief
  # WGS84 ↔ spherical Web Mercator (EPSG:3857). Two closed formulas: no proj
  # library for a single projection.
  module Mercator
    EARTH_RADIUS = 6_378_137.0

    module_function

    # [x, y] in EPSG:3857 metres.
    def forward(lng, lat)
      x = EARTH_RADIUS * lng * Math::PI / 180
      y = EARTH_RADIUS * Math.log(Math.tan(Math::PI / 4 + lat * Math::PI / 360))
      [ x, y ]
    end

    # [lng, lat] in degrees.
    def inverse(x, y)
      lng = x / EARTH_RADIUS * 180 / Math::PI
      lat = (2 * Math.atan(Math.exp(y / EARTH_RADIUS)) - Math::PI / 2) * 180 / Math::PI
      [ lng, lat ]
    end
  end
end
