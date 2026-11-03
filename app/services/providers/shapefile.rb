# A small reader for the ESRI shapefiles some regions publish their 3D
# buildings in (UrbIS Buildings 3D, Brussels): the attribute table (.dbf)
# and MultiPatch records (.shp + its index .shx), the only geometry type
# those files use. Pure Ruby, no GDAL on the server.
#
#   table = Providers::Shapefile::Table.new(dbf_bytes)
#   table.each_row { |index, row| row["TYPE"] }
#   shapes = Providers::Shapefile::Shapes.new(shp_bytes, shx_bytes)
#   shapes.box(index)    # => [xmin, ymin, xmax, ymax] (nil for a null shape)
#   shapes.rings(index)  # => [Ring(outer:, points: [[x, y, z], ...]), ...]
#
# Format: ESRI Shapefile Technical Description (1998) and dBASE III.
module Providers
  module Shapefile
    class Error < StandardError; end

    # A ring of a MultiPatch, closed, with its altitude at every point.
    # `outer`: an outer ring (a new polygon starts) rather than a hole in
    # the polygon before it.
    Ring = Data.define(:outer, :points)

    class Table
      attr_reader :fields, :count

      def initialize(bytes)
        @bytes = bytes.b
        raise Error, "not a dBASE table" if @bytes.bytesize < 32

        @count, @header, @record = @bytes.unpack("@4Vvv")
        @fields = []
        offset = 32
        position = 1 # the deletion flag comes first
        while offset < @header - 1 && @bytes.getbyte(offset) != 0x0D
          name = @bytes.byteslice(offset, 11).delete("\0")
          length = @bytes.getbyte(offset + 16)
          @fields << [ name, position, length ]
          position += length
          offset += 32
        end
      end

      # The value of one field of a row, stripped (UTF-8, as the .cpg says).
      def value(index, name)
        field = @fields.find { |f| f[0] == name } or return nil
        start = @header + index * @record + field[1]
        @bytes.byteslice(start, field[2]).force_encoding(Encoding::UTF_8).scrub.strip
      end

      def each_row
        return enum_for(:each_row) unless block_given?

        @count.times do |index|
          start = @header + index * @record
          next if @bytes.getbyte(start) == 0x2A # deleted

          row = @fields.to_h { |name, position, length| [ name, @bytes.byteslice(start + position, length).force_encoding(Encoding::UTF_8).scrub.strip ] }
          yield index, row
        end
      end
    end

    class Shapes
      MULTIPATCH = 31
      # Part types: triangle strip, triangle fan, outer ring, inner ring,
      # first ring, ring (ESRI, p. 25).
      STRIP, FAN, OUTER, INNER, FIRST, RING = 0, 1, 2, 3, 4, 5

      def initialize(shp, shx)
        @shp = shp.b
        @shx = shx.b
        raise Error, "not a shapefile" if @shp.bytesize < 100 || @shp.unpack1("N") != 9994

        @type = @shp.unpack1("@32V")
        raise Error, "shape type #{@type}, only MultiPatch is read" unless @type == MULTIPATCH
      end

      def count = (@shx.bytesize - 100) / 8

      # The record's 2D box, read without decoding its points.
      def box(index)
        content = content_offset(index)
        return nil unless content && @shp.unpack1("@#{content}V") == MULTIPATCH

        @shp.unpack("@#{content + 4}E4")
      end

      # The record's rings. Triangle strips and fans are rare in building
      # models; each of their triangles comes out as its own outer ring.
      def rings(index)
        content = content_offset(index)
        return [] unless content && @shp.unpack1("@#{content}V") == MULTIPATCH

        parts_count, points_count = @shp.unpack("@#{content + 36}VV")
        starts = @shp.unpack("@#{content + 44}V#{parts_count}")
        types = @shp.unpack("@#{content + 44 + 4 * parts_count}V#{parts_count}")
        xy_at = content + 44 + 8 * parts_count
        xy = @shp.unpack("@#{xy_at}E#{2 * points_count}")
        z = @shp.unpack("@#{xy_at + 16 * points_count + 16}E#{points_count}")
        points = Array.new(points_count) { |k| [ xy[2 * k], xy[2 * k + 1], z[k] ] }

        rings = []
        starts.each_with_index do |start, part|
          stop = starts[part + 1] || points_count
          slice = points[start...stop]
          case types[part]
          when OUTER, FIRST then rings << Ring.new(outer: true, points: close(slice))
          when INNER, RING then rings << Ring.new(outer: rings.empty?, points: close(slice))
          when STRIP then slice.each_cons(3) { |tri| rings << Ring.new(outer: true, points: close(tri)) }
          when FAN then slice.drop(1).each_cons(2) { |b, c| rings << Ring.new(outer: true, points: close([ slice[0], b, c ])) }
          end
        end
        rings.reject { |ring| ring.points.size < 4 }
      end

      private
        def content_offset(index)
          return nil if index.negative? || index >= count

          offset = @shx.unpack1("@#{100 + index * 8}N") * 2
          offset + 8 <= @shp.bytesize ? offset + 8 : nil
        end

        def close(points)
          points.first == points.last ? points : points + [ points.first ]
        end
    end
  end
end
