factory = RGeo::Geos.factory(srid: 4326)

wallonia = Region.find_or_initialize_by(key: "wallonia")
wallonia.assign_attributes(
  name: "Wallonie",
  country_code: "BE",
  locale: "fr",
  active: true,
  default_zoom: 8,
  center: factory.point(4.87, 50.47),
  bounds: factory.parse_wkt("POLYGON((2.84 49.49, 6.41 49.49, 6.41 50.82, 2.84 50.82, 2.84 49.49))"),
  settings: wallonia.settings.merge(
    "attribution" => "Géoportail de la Wallonie, SPW",
    "crs" => "EPSG:31370"
  )
)
wallonia.save!
