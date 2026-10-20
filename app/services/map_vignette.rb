# The vignette of a place for an e-mail: its outline washed in watercolour
# and drawn twice in pencil, with what is drawn on it (water, hedges,
# buildings, existing trees, plants by strata at their adult spread), north
# up, as a PNG small enough to travel inline. The same reading as the
# sketches of « Mes cartes » (my_maps/sketch.ts).
#
# Drawn with libvips' own drawing operations (polygons filled here, line by
# line): its SVG loader stays blocked, as Active Storage wants for uploads.
# Nil without an outline, or when the image cannot be made: an e-mail never
# waits on its vignette.
class MapVignette
  WIDTH = 1120
  HEIGHT = 480
  PAD = 44

  PAPER = [ 247, 243, 234 ].freeze
  WASH = [ 211, 220, 143 ].freeze
  BLOOM = [ 175, 189, 0 ].freeze
  PENCIL = [ 77, 74, 69 ].freeze
  WATER = [ 111, 151, 182 ].freeze
  TREE = [ 138, 145, 122 ].freeze
  BUILDING = [ 185, 178, 166 ].freeze
  SCALE_INK = [ 107, 102, 92 ].freeze
  # Same colours as the map (app/frontend/map/plants/strataColors.ts).
  STRATA = {
    "canopy" => [ 77, 85, 0 ], "sub_canopy" => [ 175, 189, 0 ], "shrub" => [ 200, 48, 94 ], "herbaceous" => [ 239, 155, 13 ],
    "ground_cover" => [ 31, 143, 122 ], "vine" => [ 122, 62, 157 ], "root" => [ 160, 95, 0 ], "aquatic" => [ 43, 123, 185 ]
  }.freeze

  def self.png(map) = new(map).png

  def initialize(map)
    @map = map
  end

  def png
    image = draw
    image&.write_to_buffer(".png", compression: 9)
  rescue StandardError, LoadError => e
    Rails.error.report(e, handled: true, severity: :warning, context: { map_id: @map.id })
    nil
  end

  # The vignette as a libvips image (sRGB with alpha), or nil without an outline.
  def draw
    outline = MapSketch.new([ @map ]).outlines[@map.id]
    rings = outer_rings(outline&.dig(:boundary))
    return if rings.empty?
    sketch = MapSketch.new([ @map ]).as_json[@map.id] || {}
    setup_projection(rings)
    outlines = rings.map { |ring| ring.map { project(_1) } }
    rand = Random.new(@map.id * 7 + 5)

    layers = []
    layers << fill(mask(outlines.map { |ring| ring.map { |x, y| [ x + 6, y + 4 ] } }), BLOOM, 0.18)
    wash = mask(outlines)
    layers << fill(wash.gaussblur(1.2), WASH, 0.7)
    # Watercolour pools at its edges as it dries.
    layers << fill((wash.cast(:float) - wash.gaussblur(5)).then { (_1 > 0).ifthenelse(_1, 0) }.cast(:uchar), BLOOM, 0.35)
    water = Array(sketch[:water]).flat_map { polygons(_1) }
    layers << fill(mask(water), WATER, 0.55) if water.any?
    buildings = Array(sketch[:buildings]).flat_map { polygons(_1) }
    layers << fill(mask(buildings), BUILDING, 0.8) if buildings.any?
    hedges = Array(sketch[:hedges]).flat_map { lines(_1) }
    layers << strokes(hedges, STRATA["canopy"], 0.45, width: 6) if hedges.any?
    trees = Array(sketch[:trees]).map { project(_1) }
    layers << dots(trees.map { |x, y| [ x, y, [ 4 * @scale, 6 ].max ] }, TREE, 0.5) if trees.any?
    STRATA.each do |strata, colour|
      plants = Array(sketch[:plants]).select { _1[2] == strata }
      next if plants.empty?
      layers << dots(plants.map { |lng, lat, _, spread| [ *project([ lng, lat ]), [ spread.to_f / 2 * @scale, 4.4 ].max ] }, colour, strata == "canopy" ? 0.35 : 0.5)
    end
    pencil = outlines.map { densify(_1, 14) }
    layers << strokes(pencil.map { |ring| wobble(ring, rand, 1.0) }, PENCIL, 0.8, width: 2, closed: true)
    layers << strokes(pencil.map { |ring| wobble(ring, rand, 2.4) }, PENCIL, 0.35, width: 2, closed: true)
    layers << scale_bar

    paper.composite(layers, :over)
  end

  private
    def outer_rings(geom)
      case geom&.dig("type")
      when "Polygon" then [ geom["coordinates"][0] ]
      when "MultiPolygon" then geom["coordinates"].map(&:first)
      else []
      end
    end

    # Local metres around the terrain (equirectangular), fitted into the box.
    def setup_projection(rings)
      points = rings.flatten(1)
      lat0 = points.sum { _1[1] } / points.size
      @k = Math.cos(lat0 * Math::PI / 180)
      xy = points.map { raw(_1) }
      @x0, @x1 = xy.map(&:first).minmax
      @y0, @y1 = xy.map(&:last).minmax
      @scale = [ (WIDTH - 2 * PAD) / [ @x1 - @x0, 1 ].max, (HEIGHT - 2 * PAD) / [ @y1 - @y0, 1 ].max ].min
      @ox = (WIDTH - @scale * (@x1 - @x0)) / 2
      @oy = (HEIGHT - @scale * (@y1 - @y0)) / 2
    end

    def raw(point) = [ point[0] * 111_320 * @k, -point[1] * 110_540 ]

    def project(point)
      x, y = raw(point)
      [ @ox + (x - @x0) * @scale, @oy + (y - @y0) * @scale ]
    end

    def densify(points, step)
      points.each_cons(2).flat_map do |(ax, ay), (bx, by)|
        n = [ (Math.hypot(bx - ax, by - ay) / step).ceil, 1 ].max
        (0...n).map { |i| [ ax + (bx - ax) * i / n, ay + (by - ay) * i / n ] }
      end + [ points.last ]
    end

    # A pencil line never falls exactly on the same place twice.
    def wobble(points, rand, amount)
      points.map { |x, y| [ x + rand.rand(-amount..amount), y + rand.rand(-amount..amount) ] }
    end

    def polygons(geom)
      case geom&.dig("type")
      when "Polygon" then [ geom["coordinates"][0].map { project(_1) } ]
      when "MultiPolygon" then geom["coordinates"].map { _1[0].map { |p| project(p) } }
      else []
      end
    end

    def lines(geom)
      case geom&.dig("type")
      when "LineString" then [ geom["coordinates"].map { project(_1) } ]
      when "MultiLineString" then geom["coordinates"].map { _1.map { |p| project(p) } }
      when "Polygon", "MultiPolygon" then polygons(geom)
      else []
      end
    end

    def paper = blank(PAPER, 255)

    # A one-band image of the polygons, filled with the even-odd rule.
    def mask(rings)
      bytes = "\0".b * (WIDTH * HEIGHT)
      edges = rings.flat_map { |ring| ring.each_cons(2).to_a + [ [ ring.last, ring.first ] ] }
      HEIGHT.times do |row|
        y = row + 0.5
        xs = edges.filter_map do |(ax, ay), (bx, by)|
          next if (ay <= y) == (by <= y)
          ax + (y - ay) * (bx - ax) / (by - ay)
        end.sort
        xs.each_slice(2) do |from, to|
          next unless to
          a = from.round.clamp(0, WIDTH)
          b = to.round.clamp(0, WIDTH)
          bytes[row * WIDTH + a, b - a] = "\xFF".b * (b - a) if b > a
        end
      end
      Vips::Image.new_from_memory(bytes, WIDTH, HEIGHT, 1, :uchar)
    end

    # A colour layer whose alpha is the mask times the opacity.
    def fill(mask, colour, opacity)
      alpha = (mask.cast(:float) * opacity).cast(:uchar)
      blank(colour, 0).extract_band(0, n: 3).bandjoin(alpha).copy(interpretation: :srgb)
    end

    def dots(circles, colour, opacity)
      layer = blank([ 0, 0, 0 ], 0)
      ink = [ *colour, (opacity * 255).round ]
      layer.mutate do |image|
        circles.each { |x, y, r| image.draw_circle!(ink, x.round, y.round, r.round.clamp(1, 400), fill: true) }
      end
    end

    def strokes(paths, colour, opacity, width:, closed: false)
      layer = blank([ 0, 0, 0 ], 0)
      ink = [ *colour, (opacity * 255).round ]
      offsets = (0...width).map { _1 - (width - 1) / 2.0 }
      layer.mutate do |image|
        paths.each do |points|
          segments = points.each_cons(2).to_a
          segments << [ points.last, points.first ] if closed
          segments.each do |(ax, ay), (bx, by)|
            offsets.each { |d| image.draw_line!(ink, (ax + d).round, ay.round, (bx + d).round, by.round) }
          end
        end
      end
    end

    # A real scale bar, bottom left, with its length.
    def scale_bar
      target = WIDTH * 0.18 / @scale
      metres = [ 2000, 1000, 500, 200, 100, 50, 20, 10, 5, 2, 1 ].find { _1 <= target } || 1
      len = (metres * @scale).round
      x, y = 28, HEIGHT - 28
      ink = [ *SCALE_INK, 255 ]
      layer = blank([ 0, 0, 0 ], 0).mutate do |image|
        [ [ x, y, x + len, y ], [ x, y - 6, x, y + 6 ], [ x + len, y - 6, x + len, y + 6 ] ].each do |line|
          image.draw_line!(ink, *line)
          image.draw_line!(ink, line[0], line[1] + 1, line[2], line[3] + 1) if line[1] == line[3]
        end
      end
      label = Vips::Image.text("#{metres} m", font: "sans 20", dpi: 72)
      text = blank(SCALE_INK, 0).extract_band(0, n: 3).bandjoin(label.embed(x + len + 12, y - 14, WIDTH, HEIGHT)).copy(interpretation: :srgb)
      layer.composite([ text ], :over)
    rescue Vips::Error
      layer
    end

    def blank(colour, alpha)
      (Vips::Image.black(WIDTH, HEIGHT, bands: 4) + [ *colour, alpha ]).cast(:uchar).copy(interpretation: :srgb)
    end
end
