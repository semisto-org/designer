# A ready terrain built from a formula instead of an elevation service:
# `height.call(dx, dy)` gives the height in metres at `dx` metres east and `dy`
# metres north of the boundary's centre (nil for no data).
module SyntheticTerrainHelper
  def synthetic_terrain(map, cell_size_m: 1.0, margin_m: 10, &height)
    extent = Relief::Extent.around(map.bbox, cell_size_m:, margin_m:)
    centre = map.boundary.centroid
    cx, cy = Relief::Mercator.forward(centre.x, centre.y)
    scale = Math.cos(extent.lat0 * Math::PI / 180)
    heights = Array.new(extent.cells) do |i|
      x, y = extent.point(i)
      height.call((x - cx) * scale, (y - cy) * scale)
    end
    packed = Relief::Raster.pack_heights(heights)
    terrain = map.terrain || map.build_terrain
    terrain.update!(
      status: "ready", crs: "EPSG:3857", west: extent.west, north: extent.north, step: extent.step,
      cols: extent.cols, rows: extent.rows, cell_size_m: extent.cell_size_m, lat0: extent.lat0, margin_m: extent.margin_m,
      z_min: packed.z_min, z_max: packed.z_max, z_unit: Relief::Raster::Z_UNIT, nodata: Relief::Raster::NODATA,
      fetched_at: Time.current
    )
    terrain.grid.attach(io: StringIO.new(packed.bytes), filename: "terrain.bin", content_type: "application/octet-stream", identify: false)
    terrain
  end
end
