# Development helpers of the relief-water area. The SPW geoservices are not
# reachable from every machine (CI, sandboxes): `relief:synthetic` gives a map
# an invented but plausible terrain through the real import pipeline, so the
# editor panel and the 3D page can be tried and screenshotted offline.
module ReliefDev
  # A provider with the interface of Providers::ArcgisIdentify, computing
  # its values instead of asking a server: a sloping valley with a stream,
  # a hollow, a wood on one side, a meadow, a field and a house.
  class SyntheticProvider
    LANDCOVER = { meadow: 7, wood: 9, field: 6, house: 2, road: 1 }.freeze

    def initialize(extent_center:)
      @cx, @cy = extent_center
    end

    def key = "synthetic"
    def label = "Relief synthétique (développement)"
    def attribution = "Relief synthétique, pas un vrai terrain"
    def chunk_size = 50_000
    def threads = 1
    def dataset?(name) = %i[terrain surface landcover texture].include?(name.to_sym)
    def dataset_label(name) = "#{label} (#{name})"

    def sample(name, points, extent)
      scale = Math.cos(extent.lat0 * Math::PI / 180)
      points.map do |x, y|
        mx = (x - @cx) * scale
        my = (y - @cy) * scale
        case name.to_sym
        when :terrain then ground(mx, my).round(2)
        when :surface then (ground(mx, my) + above(mx, my)).round(2)
        when :landcover then landcover(mx, my)
        end
      end
    end

    # A shaded relief tinted by land cover, encoded as JPEG by ImageMagick.
    def texture(extent, max_px: 1024)
      width = [ max_px, extent.cols ].min
      height = (width * extent.rows.to_f / extent.cols).round
      scale = Math.cos(extent.lat0 * Math::PI / 180)
      sx = (extent.east - extent.west) / (width - 1)
      sy = (extent.north - extent.south) / (height - 1)
      colors = { 7 => [ 132, 170, 84 ], 9 => [ 52, 96, 50 ], 6 => [ 196, 176, 104 ], 2 => [ 150, 92, 80 ], 1 => [ 120, 116, 110 ] }
      pixels = String.new(capacity: width * height * 3, encoding: Encoding::BINARY)
      height.times do |row|
        width.times do |col|
          mx = (extent.west + col * sx - @cx) * scale
          my = (extent.north - row * sy - @cy) * scale
          dzdx = ground(mx + 1, my) - ground(mx - 1, my)
          dzdy = ground(mx, my + 1) - ground(mx, my - 1)
          shade = (1.0 - 0.9 * dzdx + 0.6 * dzdy).clamp(0.55, 1.25)
          noise = 0.92 + 0.08 * Math.sin(mx * 1.7) * Math.cos(my * 1.3)
          base = colors.fetch(landcover(mx, my), [ 140, 150, 110 ])
          base = [ 70, 120, 170 ] if stream?(mx, my)
          pixels << base.map { |c| (c * shade * noise).round.clamp(0, 255) }.pack("C3")
        end
      end
      ppm = "P6\n#{width} #{height}\n255\n".b + pixels
      bytes, status = Open3.capture2("convert", "ppm:-", "-quality", "80", "jpg:-", stdin_data: ppm, binmode: true)
      raise "ImageMagick failed" unless status.success?

      { bytes:, width:, height: }
    end

    private
      def valley_axis(my) = 35 * Math.sin(my / 110.0)

      def ground(mx, my)
        d = mx - valley_axis(my)
        z = 210 + 0.07 * my + 0.035 * mx.abs
        z -= 9 * Math.exp(-(d**2) / (2 * 55.0**2))
        z -= 1.6 * Math.exp(-((mx - 70)**2 + (my + 40)**2) / (2 * 14.0**2))
        z + 0.25 * Math.sin(mx / 9.0) * Math.cos(my / 11.0)
      end

      def stream?(mx, my) = (mx - valley_axis(my)).abs < 1.5

      def house?(mx, my) = (mx + 60).abs < 7 && (my - 50).abs < 5

      def wood?(mx, my) = mx > 95 + 20 * Math.sin(my / 60.0)

      def above(mx, my)
        return 6.5 if house?(mx, my)
        return 14 + 6 * Math.sin(mx / 5.0) * Math.cos(my / 6.0) if wood?(mx, my)
        return 4.0 if (my + 110).abs < 2.5 && mx < 60 # a hedge
        0.2
      end

      def landcover(mx, my)
        return LANDCOVER[:house] if house?(mx, my)
        return LANDCOVER[:wood] if wood?(mx, my)
        return LANDCOVER[:road] if (mx + 130).abs < 2
        return LANDCOVER[:field] if my > 120

        LANDCOVER[:meadow]
      end
  end
end

namespace :relief do
  desc "Development only: import an invented terrain for a map (MAP_ID=…, default: first map with a boundary)"
  task synthetic: :environment do
    abort "relief:synthetic only runs in development or test." unless Rails.env.local?

    require "open3"
    map = ENV["MAP_ID"] ? Map.find(ENV["MAP_ID"]) : Map.where.not(boundary: nil).order(:id).first
    abort "No map with a boundary: draw one first (or pass MAP_ID)." unless map&.boundary

    terrain = map.terrain || map.create_terrain!
    extent = Relief::GridPolicy.extent_for(map.bbox, margin_m: Relief::GridPolicy::DEFAULT_MARGIN_M)
    center = [ extent.west + (extent.cols - 1) * extent.step / 2, extent.north - (extent.rows - 1) * extent.step / 2 ]
    provider = ReliefDev::SyntheticProvider.new(extent_center: center)
    Relief::TerrainImport.new(terrain, provider:).call
    terrain.reload
    puts "Map #{map.id}: terrain #{terrain.status} (#{terrain.cols}×#{terrain.rows} cells of #{terrain.cell_size_m} m)#{" — #{terrain.error}" if terrain.error}"
  end
end
