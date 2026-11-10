# Writes small UrbIS-like shapefiles (MultiPatch faces + their attribute
# table) for the tests of Providers::Shapefile and Providers::UrbisBuildings3d.
module ShapefileTestHelper
  # A face: its type (ROOFSURFACE, GROUNDSURFACE, WALLSURFACE), its solid,
  # and its rings as [[x, y, z], ...] (the first one outer, the next ones
  # holes, unless `outer: [...]` says which are outer).
  Face = Struct.new(:id, :solid, :type, :rings, keyword_init: true)

  FIELDS = [ [ "INSPIRE_ID", 88 ], [ "BUSOLID_ID", 88 ], [ "TYPE", 254 ] ].freeze

  def multipatch_files(faces)
    shp_records = faces.map { |face| multipatch_content(face.rings) }
    { "shp" => shapefile(shp_records, index: false), "shx" => shapefile(shp_records, index: true), "dbf" => dbase(faces) }
  end

  # A tile's zip, as UrbIS publishes it (shp/ folder, BuildingFaces and BuildingSolids).
  def urbis_tile_zip(tile, faces)
    files = multipatch_files(faces)
    buffer = Zip::OutputStream.write_buffer do |zip|
      files.each do |extension, bytes|
        zip.put_next_entry("shp/UrbISBuildings3D_#{tile}_BuildingFaces.#{extension}")
        zip.write(bytes)
      end
      zip.put_next_entry("shp/UrbISBuildings3D_#{tile}_BuildingSolids.cpg")
      zip.write("UTF-8")
    end
    buffer.string
  end

  # Lambert 72 → WGS84 through PostGIS, the reference the provider must match.
  def lambert_to_wgs84(x, y)
    row = ActiveRecord::Base.connection.select_rows(
      "SELECT ST_X(g), ST_Y(g) FROM ST_Transform(ST_SetSRID(ST_MakePoint(#{Float(x)}, #{Float(y)}), 31370), 4326) AS g"
    ).first
    row.map(&:to_f)
  end

  def wgs84_to_lambert(lng, lat)
    row = ActiveRecord::Base.connection.select_rows(
      "SELECT ST_X(g), ST_Y(g) FROM ST_Transform(ST_SetSRID(ST_MakePoint(#{Float(lng)}, #{Float(lat)}), 4326), 31370) AS g"
    ).first
    row.map(&:to_f)
  end

  private
    def multipatch_content(rings)
      points = rings.flatten(1)
      xs = points.map { |p| p[0] }
      ys = points.map { |p| p[1] }
      zs = points.map { |p| p[2] }
      starts = rings.each_with_object([ 0 ]) { |ring, acc| acc << acc.last + ring.size }[0...-1]
      types = rings.each_index.map { |k| k.zero? ? 4 : 3 } # first ring, then inner rings
      [ 31, xs.min, ys.min, xs.max, ys.max, rings.size, points.size ].pack("VE4VV") +
        starts.pack("V*") + types.pack("V*") +
        points.flat_map { |p| p[0, 2] }.pack("E*") +
        [ zs.min, zs.max ].pack("E2") + zs.pack("E*")
    end

    def shapefile(records, index:)
      offset = 50 # in 16-bit words, after the 100-byte header
      body = +"".b
      records.each_with_index do |content, k|
        words = content.bytesize / 2
        body << (index ? [ offset, words ].pack("NN") : [ k + 1, words ].pack("NN") + content)
        offset += 4 + words
      end
      length = (100 + body.bytesize) / 2
      header = [ 9994, 0, 0, 0, 0, 0, length ].pack("N7") + [ 1000, 31 ].pack("VV") + ([ 0.0 ] * 8).pack("E8")
      header + body
    end

    def dbase(faces)
      record = 1 + FIELDS.sum(&:last)
      header_length = 32 + 32 * FIELDS.size + 1
      header = [ 3, 126, 10, 3, faces.size, header_length, record ].pack("CCCCVvv") + ("\0" * 20)
      descriptors = FIELDS.map { |name, length| name.ljust(11, "\0") + "C" + ("\0" * 4) + [ length, 0 ].pack("CC") + ("\0" * 14) }.join
      rows = faces.map do |face|
        values = [ "https://databrussels.be/id/buildingface/#{face.id}", "https://databrussels.be/id/buildingsolid/#{face.solid}", face.type ]
        " " + values.zip(FIELDS).map { |value, (_, length)| value.ljust(length) }.join
      end
      (header + descriptors + "\r" + rows.join + "\x1A").b
    end
end
