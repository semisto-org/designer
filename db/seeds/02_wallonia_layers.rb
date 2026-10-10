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

photo = lambda do |key, name, service, position, description:, max_zoom:, default: false|
  options = { "format" => "image/jpeg", "order" => position }
  options["default"] = true if default
  {
    key:, name:, group_name: "photos", category: "base", kind: "wms", url: wms.(service), layers: "0",
    identify_url: nil, attribution: spw_attribution, opacity: 1.0, position:, min_zoom: nil, max_zoom:,
    proxied: true, enabled: true, description:, options:
  }
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
  photo.("ortho_2026", "Photo 2026", "IMAGERIE/ORTHO_2026_PRINTEMPS", 20, max_zoom: 19, default: true,
         description: "Photo aérienne du printemps 2026 : le terrain tel qu'il est aujourd'hui."),
  photo.("ortho_1994", "Photo 1994-2000", "IMAGERIE/ORTHO_1994_2000", 30, max_zoom: 18,
         description: "Photos aériennes de 1994 à 2000 : ce qui a changé en une génération."),
  photo.("ortho_1971", "Photo 1971", "IMAGERIE/ORTHO_1971", 40, max_zoom: 18,
         description: "Photo aérienne de 1971, en noir et blanc : haies, vergers et chemins disparus."),

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
