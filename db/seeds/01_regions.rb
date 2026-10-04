# The regions: "europe", the pan-European base every region inherits from,
# then the equipped regions with their outline (db/seeds/regions/*.geojson:
# Natural Earth 1:10m, public domain, simplified to ~300 m; France is cut to
# metropolitan France and Corsica). A map belongs to the region whose
# outline covers its place, else to "europe" (Region.for_point).
factory = RGeo::Geos.factory(srid: 4326)
outline = lambda do |key|
  geojson = File.read(Rails.root.join("db/seeds/regions/#{key}.geojson"))
  RGeo::GeoJSON.decode(geojson, geo_factory: factory)
end

europe = Region.find_or_initialize_by(key: Region::EUROPE_KEY)
europe.assign_attributes(
  name: "Europe",
  country_code: "EU",
  locale: "fr",
  active: true,
  default_zoom: 5,
  parent: nil,
  center: factory.point(4.5, 48.5),
  bounds: factory.parse_wkt("POLYGON((-25 34, 45 34, 45 72, -25 72, -25 34))"),
  outline: nil,
  settings: europe.settings.merge("attribution" => "Copernicus, Agence européenne pour l'environnement, ISRIC, OpenStreetMap")
)
europe.save!

regions = {
  "wallonia" => {
    name: "Wallonie", country_code: "BE", default_zoom: 8, center: factory.point(4.87, 50.47),
    bounds: "POLYGON((2.84 49.49, 6.41 49.49, 6.41 50.82, 2.84 50.82, 2.84 49.49))",
    settings: { "attribution" => "Géoportail de la Wallonie, SPW", "crs" => "EPSG:31370" }
  },
  "france" => {
    name: "France", country_code: "FR", default_zoom: 6, center: factory.point(2.5, 46.6),
    bounds: "POLYGON((-5.3 41.3, 9.6 41.3, 9.6 51.1, -5.3 51.1, -5.3 41.3))",
    settings: { "attribution" => "IGN, Géoplateforme", "crs" => "EPSG:2154" }
  },
  "luxembourg" => {
    name: "Luxembourg", country_code: "LU", default_zoom: 10, center: factory.point(6.13, 49.78),
    bounds: "POLYGON((5.7 49.44, 6.54 49.44, 6.54 50.19, 5.7 50.19, 5.7 49.44))",
    settings: { "attribution" => "Administration du cadastre et de la topographie (ACT), geoportail.lu", "crs" => "EPSG:2169" }
  }
}

regions.each do |key, attributes|
  region = Region.find_or_initialize_by(key:)
  region.assign_attributes(
    name: attributes[:name], country_code: attributes[:country_code], locale: "fr", active: true,
    default_zoom: attributes[:default_zoom], center: attributes[:center],
    bounds: factory.parse_wkt(attributes[:bounds]), outline: outline.call(key), parent: europe,
    settings: region.settings.merge(attributes[:settings])
  )
  region.save!
end
