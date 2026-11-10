# Photo layers of a region through time (PhotoArchive), and upstream images
# to stub them with. Images are built inside each test, never at file load
# (a Vips image made before the parallel fork hangs the workers).
module PhotoArchiveTestHelper
  WMS = "https://geoservices.wallonie.be/arcgis/services".freeze

  def photo_layer(region, key, service, year:, position:, **options)
    region.layers.create!(
      key:, name: "Photo #{year}", group_name: "photos", category: "base", kind: "wms", proxied: true,
      url: "#{WMS}/IMAGERIE/#{service}/MapServer/WMSServer", layers: "0", position:,
      options: { "format" => "image/jpeg", "year" => year, "vintage" => year.to_s }.merge(options.transform_keys(&:to_s))
    )
  end

  def seed_wallonia_photos
    region = regions(:wallonia)
    [
      photo_layer(region, "ortho_1971", "ORTHO_1971", year: 1971, position: 20),
      photo_layer(region, "ortho_2022_ete", "ORTHO_2022_ETE", year: 2022, position: 21, season: "summer", partial: true),
      photo_layer(region, "ortho_2022_ete_ir", "ORTHO_2022_ETE_IR", year: 2022, position: 21, season: "summer", partial: true,
                                                                    infrared_of: "ortho_2022_ete"),
      photo_layer(region, "ortho_2026", "ORTHO_2026_PRINTEMPS", year: 2026, position: 22, season: "spring", default: true),
      photo_layer(region, "ortho_2026_ir", "ORTHO_2026_PRINTEMPS_IR", year: 2026, position: 22, infrared_of: "ortho_2026")
    ]
  end

  def jpeg(rgb = [ 60, 120, 40 ], size: 32)
    Vips::Image.black(size, size).add(rgb).cast(:uchar).jpegsave_buffer
  end

  def stub_photo(service, body)
    stub_request(:get, %r{\A#{Regexp.escape(WMS)}/IMAGERIE/#{service}/MapServer/WMSServer\?})
      .to_return(status: 200, body:, headers: { "Content-Type" => "image/jpeg" })
  end
end
