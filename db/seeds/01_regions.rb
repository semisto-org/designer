# The regions: "europe", the pan-European base every region inherits from,
# then the equipped regions with their outline (db/seeds/regions/*.geojson:
# Natural Earth 1:10m, public domain, simplified to ~300 m; France is cut to
# metropolitan France and Corsica; Brussels and Flanders come from the SPF
# Finances administrative units, simplified to ~50 m and ~300 m). A map belongs to the region whose
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
  settings: europe.settings.merge(
    "attribution" => "Copernicus, Agence européenne pour l'environnement, ISRIC, OpenStreetMap",
    # A new map does not know its region yet: an exact French house number
    # comes from the national address base (see Providers::Geocoder).
    "geocoder" => { "house_numbers" => "ban" }
  )
)
europe.save!

regions = {
  "wallonia" => {
    name: "Wallonie", country_code: "BE", default_zoom: 8, center: factory.point(4.87, 50.47),
    bounds: "POLYGON((2.84 49.49, 6.41 49.49, 6.41 50.82, 2.84 50.82, 2.84 49.49))",
    settings: {
      "attribution" => "Géoportail de la Wallonie, SPW", "crs" => "EPSG:31370",
      # ICAR, the official register of addresses (Providers::Geocoder::Icar).
      "geocoder" => { "provider" => "icar", "icar" => { "url" => "https://geoservices.wallonie.be/arcgis/rest/services/DONNEES_BASE/ICAR_ADR_PT/MapServer" } },
      # What the SPW publishes about streams and basins (TerritoryHydrography,
      # MCP tool get_hydrography). Managers follow the law of 1967 on
      # non-navigable watercourses (Code de l'eau).
      "hydrography" => {
        "attribution" => "SPW — Réseau hydrographique wallon (RHW), LIDAXES, secteurs PARIS 2016-2021, masses d'eau de surface",
        "watercourses" => {
          "url" => "https://geoservices.wallonie.be/arcgis/rest/services/EAU/LIDAXES/MapServer",
          "layers" => [ 5, 6, 7, 8, 9 ], "category_field" => "CATEG", "name_fields" => %w[NOMB NOMA], "number_field" => "NUMATLAS",
          "categories" => {
            "NA" => { "key" => "navigable", "label" => "Voie navigable", "manager" => "SPW Mobilité et Infrastructures (voies hydrauliques)" },
            "01" => { "key" => "category_1", "label" => "Cours d'eau non navigable de 1re catégorie",
                      "manager" => "Région wallonne (SPW Agriculture, Ressources naturelles et Environnement, Direction des cours d'eau non navigables)" },
            "02" => { "key" => "category_2", "label" => "Cours d'eau non navigable de 2e catégorie", "manager" => "La province (service technique provincial)" },
            "03" => { "key" => "category_3", "label" => "Cours d'eau non navigable de 3e catégorie", "manager" => "La commune" },
            "NC" => { "key" => "unclassified", "label" => "Cours d'eau non classé", "manager" => "Les propriétaires riverains" },
            "ND" => { "key" => "undefined", "label" => "Catégorie non définie à l'atlas des cours d'eau" }
          }
        },
        "runoff_axes" => {
          "url" => "https://geoservices.wallonie.be/arcgis/rest/services/EAU/LIDAXES/MapServer/1", "label" => "LIDAXES (SPW, MNT LiDAR 2013-2014)",
          "class_field" => "grid_code", "default_min_class" => 3,
          "classes" => { "1" => "3 à 10 ha", "2" => "10 à 20 ha", "3" => "20 à 50 ha", "4" => "50 à 100 ha", "5" => "plus de 100 ha" }
        },
        "sub_basins" => {
          "url" => "https://geoservices.wallonie.be/arcgis/rest/services/EAU/SECTEURS_PARIS_1621/MapServer/1", "label" => "secteur PARIS",
          "id_field" => "SECT_PARIS", "water_body_field" => "MAS_EAU_SURF",
          "sectors_url" => "https://geoservices.wallonie.be/arcgis/rest/services/EAU/SECTEURS_PARIS_1621/MapServer/0",
          "watercourse_field" => "COURS_EAU", "outlet_field" => "REPERE_AVA", "outlet_x" => "X_LB72_AVAL", "outlet_y" => "Y_LB72_AVAL", "outlet_srid" => 31370
        },
        "water_bodies" => {
          "url" => "https://geoservices.wallonie.be/arcgis/rest/services/EAU/MESU/MapServer/2",
          "id_field" => "ID_RW_MESU", "name_field" => "NOM_MESU", "area_field" => "AREA_KM2", "sheet_field" => "FICHE_PDF_MESU_FR"
        }
      }
    }
  },
  "flanders" => {
    name: "Flandre", country_code: "BE", default_zoom: 8, center: factory.point(4.3, 51.0),
    bounds: "POLYGON((2.54 50.68, 5.92 50.68, 5.92 51.51, 2.54 51.51, 2.54 50.68))",
    settings: { "attribution" => "Digitaal Vlaanderen, DOV, SPF Finances (AGDP)", "crs" => "EPSG:31370" }
  },
  "france" => {
    name: "France", country_code: "FR", default_zoom: 6, center: factory.point(2.5, 46.6),
    bounds: "POLYGON((-5.3 41.3, 9.6 41.3, 9.6 51.1, -5.3 51.1, -5.3 41.3))",
    settings: { "attribution" => "IGN, Géoplateforme", "crs" => "EPSG:2154", "geocoder" => { "provider" => "ban" } }
  },
  "brussels" => {
    name: "Bruxelles", country_code: "BE", default_zoom: 11, center: factory.point(4.36, 50.84),
    bounds: "POLYGON((4.24 50.76, 4.49 50.76, 4.49 50.92, 4.24 50.92, 4.24 50.76))",
    settings: { "attribution" => "UrbIS – paradigm.brussels, SPF Finances (AGDP)", "crs" => "EPSG:31370" }
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

# A map placed before its region was equipped (it fell to "europe") moves to
# that region on the next seed, so its editor gets the regional layers.
Map.where(region: europe).find_each do |map|
  point = (map.boundary.centroid if map.boundary && !map.boundary.empty?) || map.center
  next unless point

  region = Region.for_point(point.x, point.y)
  map.update_columns(region_id: region.id) unless region == europe
end
