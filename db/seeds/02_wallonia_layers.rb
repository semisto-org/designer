# Ported from Claudy (MIT, © 2022-2023 Fondation Les 4 Sources)
# (app/models/map_geoportail_layer.rb: services, WMS/REST layer ids,
# opacities, stacking order, scale caps).
#
# The map catalogue of Wallonia: base maps (a neutral plan, SPW aerial
# photos) and the Géoportail de la Wallonie data overlays. Idempotent: run
# on every deploy. A layer edited by hand in the database keeps its edits
# when its `options.locked` is true; new layers added in the database (other
# keys) are never touched.
#
# Gotchas kept from Claudy:
# - ArcGIS numbers WMS layers differently from REST layers (often
#   reversed): `layers` follows the WMS GetCapabilities, `identify.layers`
#   the REST service.
# - The SPW hides some layers at large scales (soils below 1:5000, contours
#   below 1:2500, runoff below 1:1000): `max_zoom` caps the source so
#   MapLibre upscales the last tile instead of showing a blank one. Values
#   are MapLibre zooms for 512 px tiles, i.e. Claudy's Leaflet maxNativeZoom - 1.
# - Clicking reads exact altitude from the LiDAR DTM, not from the contour
#   layer (`courbes` identifies on RELIEF/WALLONIE_MNT_2021_2022).
wallonia = Region.find_by!(key: "wallonia")

spw = "https://geoservices.wallonie.be/arcgis"
spw_attribution = "© SPW – Géoportail de la Wallonie"
wms = ->(service) { "#{spw}/services/#{service}/MapServer/WMSServer" }
identify = ->(service) { "#{spw}/rest/services/#{service}/MapServer/identify" }

overlay = lambda do |key, name, group, order, service:, layers:, opacity:, position:, info_service: service,
                     info_layers:, description:, min_zoom: nil, max_zoom: 19, tolerance: 3, role: nil|
  options = { "identify" => { "layers" => info_layers, "formatter" => key, "tolerance" => tolerance }, "order" => order }
  options["role"] = role if role
  {
    key:, name:, group_name: group, category: "overlay", kind: "wms", url: wms.(service), layers:,
    identify_url: identify.(info_service), attribution: spw_attribution, opacity:, position:,
    min_zoom:, max_zoom:, proxied: true, enabled: true, description:, options:
  }
end

# Aerial photos: every flight the SPW publishes, from 1971 to today, so a
# map can be read through time (the « Couches » panel shows them on a
# timeline). Since 2006 most flights also have a false colour infrared twin
# (`infrared_of`). Summer flights of 2022 and 2025 cover only part of
# Wallonia (`partial`: Terranova checks each map's place before offering
# them). Service list checked on 2026-11-06 (rest/services/IMAGERIE).
photo = lambda do |key, name, service, position, description:, max_zoom:, default: false, year: nil, vintage: nil,
                   season: nil, infrared_of: nil, partial: false|
  options = { "format" => "image/jpeg", "order" => position }
  options["default"] = true if default
  options["year"] = year if year
  options["vintage"] = vintage if vintage
  options["season"] = season if season
  options["infrared_of"] = infrared_of if infrared_of
  options["partial"] = true if partial
  {
    key:, name:, group_name: "photos", category: "base", kind: "wms", url: wms.(service), layers: "0",
    identify_url: nil, attribution: spw_attribution, opacity: 1.0, position:, min_zoom: nil, max_zoom:,
    proxied: true, enabled: true, description:, options:
  }
end

infrared_note = "En infrarouge fausses couleurs : la végétation en pleine santé ressort en rouge vif, l'eau et les sols " \
                "humides en sombre. Utile pour repérer les zones humides et les plantes qui souffrent."
season_note = {
  "spring" => "Arbres à peine en feuilles : on voit mieux le sol, les fossés et les haies.",
  "summer" => "Arbres en feuilles : l'ombre qu'ils portent, les prés qui restent verts ou jaunissent."
}
partial_note = "Ce vol ne couvre qu'une partie de la Wallonie."

# [key, service, short label, year, season, infrared twin?, partial?, max zoom, description]
flights = [
  [ "ortho_1971", "ORTHO_1971", "1971", 1971, nil, false, false, 18,
    "Photo aérienne de 1971, en noir et blanc : haies, vergers et chemins disparus." ],
  [ "ortho_1978", "ORTHO_1978_1990", "1978-1990", 1978, nil, false, false, 18,
    "Photos aériennes de 1978 à 1990 : le terrain il y a une quarantaine d'années." ],
  [ "ortho_1994", "ORTHO_1994_2000", "1994-2000", 1994, nil, false, false, 18,
    "Photos aériennes de 1994 à 2000 : ce qui a changé en une génération." ],
  [ "ortho_2001", "ORTHO_2001_2003", "2001-2003", 2001, nil, false, false, 18,
    "Photos aériennes de 2001 à 2003 : le terrain au tournant du siècle." ],
  [ "ortho_2006", "ORTHO_2006_2007", "2006-2007", 2006, nil, true, false, 18, nil ],
  [ "ortho_2009", "ORTHO_2009_2010", "2009-2010", 2009, nil, true, false, 18, nil ],
  [ "ortho_2012", "ORTHO_2012_2013", "2012-2013", 2012, nil, true, false, 19, nil ],
  *(2015..2021).map { |year| [ "ortho_#{year}", "ORTHO_#{year}", year.to_s, year, nil, true, false, 19, nil ] },
  [ "ortho_2022_printemps", "ORTHO_2022_PRINTEMPS", "printemps 2022", 2022, "spring", true, false, 19, nil ],
  [ "ortho_2022_ete", "ORTHO_2022_ETE", "été 2022", 2022, "summer", true, true, 19, nil ],
  [ "ortho_2023_ete", "ORTHO_2023_ETE", "été 2023", 2023, "summer", true, false, 19, nil ],
  [ "ortho_2024", "ORTHO_2024", "2024", 2024, nil, true, false, 19, nil ],
  [ "ortho_2025_printemps", "ORTHO_2025_PRINTEMPS", "printemps 2025", 2025, "spring", true, false, 19, nil ],
  [ "ortho_2025_ete", "ORTHO_2025_ETE", "été 2025", 2025, "summer", true, true, 19, nil ],
  [ "ortho_2026", "ORTHO_2026_PRINTEMPS", "printemps 2026", 2026, "spring", true, false, 19,
    "Photo aérienne du printemps 2026 : le terrain tel qu'il est aujourd'hui." ]
]

photos = flights.each_with_index.flat_map do |(key, service, label, year, season, infrared, partial, max_zoom, description), index|
  position = 20 + index
  of_label = { "spring" => "du printemps #{year}", "summer" => "de l'été #{year}" }.fetch(season, "de #{label}")
  description ||= [ "Photo aérienne #{of_label}.", season_note[season] ].compact.join(" ")
  description = [ description, partial_note ].join(" ") if partial
  name = season ? "Photo #{of_label}" : "Photo #{label}"
  rgb = photo.(key, name, "IMAGERIE/#{service}", position, max_zoom:, default: key == "ortho_2026",
               year:, vintage: label, season:, partial:, description:)
  next [ rgb ] unless infrared

  [ rgb, photo.("#{key}_ir", "#{name} en infrarouge", "IMAGERIE/#{service}_IR", position, max_zoom:,
                year:, vintage: label, season:, partial:, infrared_of: key, description: infrared_note) ]
end

catalogue = [
  # -- Base maps ---------------------------------------------------------
  {
    key: "plan", name: "Plan", group_name: "plan", category: "base", kind: "style",
    # OpenFreeMap: free, no key, commercial use allowed (attribution).
    url: "https://tiles.openfreemap.org/styles/positron", layers: nil, identify_url: nil,
    attribution: '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> ' \
                 '© <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">OpenMapTiles</a> ' \
                 'Données © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">contributeurs OpenStreetMap</a>',
    opacity: 1.0, position: 10, min_zoom: nil, max_zoom: nil, proxied: false, enabled: true,
    description: "Fond neutre : routes, bâtiments, cours d'eau et noms de lieux.",
    options: {
      "order" => 10,
      # Raster used when the vector style cannot load.
      "fallback" => {
        "url" => "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
        "attribution" => '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>'
      }
    }
  },
  *photos,

  # -- Relief, sol et eau ------------------------------------------------
  overlay.("courbes", "Courbes de niveau", "terrain", 1,
           service: "IGN/CONTOURLINES", layers: "0,1,2", opacity: 0.9, position: 150, min_zoom: 12, max_zoom: 16,
           info_service: "RELIEF/WALLONIE_MNT_2021_2022", info_layers: "0", tolerance: 0,
           description: "Une ligne tous les 1,25 m de dénivelé. Touchez la carte pour lire l'altitude exacte (LiDAR 2021-2022)."),
  overlay.("pentes", "Pentes", "terrain", 2,
           service: "RELIEF/WALLONIE_MNP_2013_2014__PENTES", layers: "1", opacity: 0.55, position: 70,
           info_layers: "0", tolerance: 0,
           description: "L'inclinaison du terrain, du plat au très pentu, d'après le LiDAR 2013-2014."),
  overlay.("ruissellement", "Ruissellement et cours d'eau", "terrain", 3,
           service: "EAU/LIDAXES", layers: "13,11,9,8,7,6,5,4", opacity: 1.0, position: 130, min_zoom: 12, max_zoom: 18,
           info_layers: "1,3,5,6,7,8,9,10",
           description: "Là où l'eau de pluie se concentre et s'écoule : axes de ruissellement, cuvettes et cours d'eau."),
  overlay.("sols", "Carte des sols", "terrain", 4,
           service: "SOL_SOUS_SOL/CNSW", layers: "1,2", opacity: 1.0, position: 100, max_zoom: 15,
           info_layers: "1,2",
           description: "Le type de sol, son drainage et sa charge caillouteuse (Carte numérique des sols de Wallonie)."),
  overlay.("essences", "Fichier écologique des essences", "terrain", 5,
           service: "FAUNE_FLORE/FEE", layers: "2", opacity: 0.55, position: 60,
           info_layers: "4,5,6,7",
           description: "Richesse et humidité du sol, climat local : pour choisir des arbres adaptés au lieu."),

  # -- Milieux et règles -------------------------------------------------
  overlay.("cadastre", "Plan cadastral", "milieux", 1,
           service: "PLAN_REGLEMENT/CADMAP_PARCELLES", layers: "0", opacity: 1.0, position: 140, min_zoom: 13,
           info_layers: "0", role: "cadastre",
           description: "Les limites et numéros des parcelles cadastrales."),
  overlay.("plan_secteur", "Plan de secteur", "milieux", 2,
           service: "AMENAGEMENT_TERRITOIRE/PDS", layers: "2,21,20,10,9,8,7,6", opacity: 0.5, position: 80,
           info_layers: "22,4,5,15,16,17,18,19",
           description: "L'affectation du sol (zone agricole, forestière, d'habitat…) et les périmètres de protection."),
  overlay.("natura2000", "Natura 2000", "milieux", 3,
           service: "FAUNE_FLORE/NATURA2000", layers: "1,2,4,5,6,7,8,9,10", opacity: 0.55, position: 110,
           info_layers: "7,9",
           description: "Sites protégés et leurs unités de gestion : des règles particulières peuvent s'y appliquer."),
  overlay.("forets_anciennes", "Forêts anciennes", "milieux", 4,
           service: "FORET/FORETANC", layers: "1,0", opacity: 0.5, position: 90,
           info_layers: "2,3",
           description: "Les forêts présentes de longue date, dont celles de la carte de Ferraris (vers 1777)."),
  overlay.("parcellaire_agricole", "Parcellaire agricole", "milieux", 5,
           service: "AGRICULTURE/SIGEC_PARC_AGRI_LAST", layers: "2,4,5,6", opacity: 0.6, position: 120,
           info_layers: "1,2,3,4",
           description: "Parcelles agricoles déclarées (culture, surface) et éléments du paysage : haies, arbres isolés, mares.")
]

legends = YAML.load_file(Rails.root.join("db/seeds/layer_legends.yml")).fetch("wallonia", {})
catalogue.each do |attributes|
  layer = wallonia.layers.find_or_initialize_by(key: attributes[:key])
  next if layer.persisted? && layer.options["locked"]
  legend = legends[attributes[:key]]
  attributes = attributes.merge(options: attributes[:options].merge("legend" => legend)) if legend
  layer.assign_attributes(attributes.except(:key))
  layer.save!
end
