# The map catalogue of Flanders: the open geo web services of Digitaal
# Vlaanderen (geo.api.vlaanderen.be, free reuse with attribution under the
# Flemish "Modellicentie Gratis Hergebruik") and the Databank Ondergrond
# Vlaanderen soil map. All WMS, GetMap in EPSG:3857 checked on 2026-10-15.
#
# - Aerial photos: the latest winter ortho (OMWRGBMRVL `Ortho`, 15 cm,
#   flown late winter: the ground shows), every older winter flight (OMW),
#   the summer flights every three years (OMZ, leaves on, with infrared),
#   1971 and 1979-1990 (OKZ) and the Ferraris map (HISTCART, around 1777).
# - Relief: the hillshade of the DHMV II LiDAR (25 cm).
# - Soil: the Belgian soil map (DOV `bodemtypes`), labelled with the soil
#   series code; no identify (GeoServer, not ArcGIS).
# - Cadastre: the federal CadGIS of the SPF Finances, as for Brussels.
#
# The European layers (Natura 2000, land cover, SoilGrids) are inherited.
# Idempotent; a layer with `options.locked` keeps its database edits.
flanders = Region.find_by!(key: "flanders")

vlaanderen = "https://geo.api.vlaanderen.be"
attribution = '© <a href="https://www.vlaanderen.be/digitaal-vlaanderen" target="_blank" rel="noopener">Digitaal Vlaanderen</a>'
cadgis = "https://ccff02.minfin.fgov.be/geoservices/arcgis"

photo = lambda do |key, name, service, layer, position, description:, default: false, year: nil, vintage: nil,
                   season: nil, infrared_of: nil, latest: false|
  options = { "format" => "image/jpeg", "order" => position }
  options["default"] = true if default
  options["year"] = year if year
  options["vintage"] = vintage if vintage
  options["season"] = season if season
  options["infrared_of"] = infrared_of if infrared_of
  options["latest"] = true if latest
  {
    key:, name:, group_name: "photos", category: "base", kind: "wms", url: "#{vlaanderen}/#{service}/wms", layers: layer,
    identify_url: nil, attribution:, opacity: 1.0, position:, min_zoom: nil, max_zoom: 20,
    proxied: true, enabled: true, description:, options:
  }
end

# Every winter flight (OMW: the ground shows) and summer flight (OMZ: leaves
# on, with its near infrared twin), on the timeline of the « Couches »
# panel. Layer list checked on 2026-11-06 from the GetCapabilities.
winter = [ [ "2000-2003", 2000, "OMWRGB00_03VL" ], [ "2005-2007", 2005, "OMWRGB05_07VL" ], [ "2008-2011", 2008, "OMWRGB08_11VL" ],
           *(2012..2025).map { |year| [ year.to_s, year, format("OMWRGB%02dVL", year % 100) ] } ]
summer = [ 2009, 2012, 2015, 2018, 2021, 2024 ]
infrared_note = "En infrarouge fausses couleurs : la végétation en pleine santé ressort en rouge vif, l'eau et les sols " \
                "humides en sombre. Utile pour repérer les zones humides et les plantes qui souffrent."

winter_photos = winter.map do |label, year, layer|
  photo.("ortho_hiver_#{label.tr("-", "_")}", "Photo d'hiver #{label}", "OMW", layer, 21 + (year - 2000),
         year:, vintage: "hiver #{label}", season: "winter",
         description: "La photo aérienne de l'hiver #{label} : arbres nus, on voit le sol, les fossés et les haies.")
end
summer_photos = summer.flat_map do |year|
  key = year == 2024 ? "ortho_ete" : "ortho_ete_#{year}"
  [ photo.(key, "Photo d'été #{year}", "OMZ", format("OMZRGB%02dVL", year % 100), 21 + (year - 2000),
           year:, vintage: "été #{year}", season: "summer",
           description: "La photo aérienne de l'été #{year} : les arbres en feuilles, l'ombre qu'ils portent."),
    photo.("#{key}_ir", "Photo d'été #{year} en infrarouge", "OMZ", format("OMZNIR%02dVL", year % 100), 21 + (year - 2000),
           year:, vintage: "été #{year}", season: "summer", infrared_of: key, description: infrared_note) ]
end

catalogue = [
  photo.("ferraris", "Carte de Ferraris (vers 1777)", "HISTCART", "ferraris", 17, year: 1777, vintage: "vers 1777",
         description: "La carte des Pays-Bas autrichiens dressée vers 1777 : bois, prés, vergers et chemins d'il y a 250 ans."),
  photo.("ortho_1971", "Photo 1971", "OKZ", "OKZPAN71VL", 18, year: 1971, vintage: "1971",
         description: "Photo aérienne de 1971, en noir et blanc : haies, vergers et chemins disparus."),
  photo.("ortho_1979", "Photo 1979-1990", "OKZ", "OKZRGB79_90VL", 19, year: 1979, vintage: "1979-1990",
         description: "Photos aériennes de 1979 à 1990 : le terrain il y a une quarantaine d'années."),
  *winter_photos,
  *summer_photos,
  photo.("ortho", "Photo d'hiver la plus récente", "OMWRGBMRVL", "Ortho", 47, default: true, season: "winter", latest: true,
         vintage: "hiver, la plus récente",
         description: "La photo aérienne d'hiver la plus récente, à 15 cm : arbres presque nus, on voit mieux le sol, les fossés et les haies."),
  {
    key: "ombrage", name: "Relief ombré (LiDAR)", group_name: "terrain", category: "overlay", kind: "wms",
    url: "#{vlaanderen}/DHMV/wms", layers: "DHMV_II_HILL_25cm", identify_url: nil, attribution:,
    opacity: 0.6, position: 50, min_zoom: nil, max_zoom: 20, proxied: true, enabled: true,
    description: "Le relief du sol nu vu par le LiDAR (DHMV II) : talus, fossés, anciennes terrasses.",
    options: { "order" => 1 }
  },
  {
    key: "sols", name: "Carte des sols", group_name: "terrain", category: "overlay", kind: "wms",
    url: "https://www.dov.vlaanderen.be/geoserver/bodemkaart/wms", layers: "bodemtypes", identify_url: nil,
    attribution: '© <a href="https://www.dov.vlaanderen.be" target="_blank" rel="noopener">Databank Ondergrond Vlaanderen</a>',
    opacity: 0.6, position: 100, min_zoom: nil, max_zoom: 20, proxied: true, enabled: true,
    description: "La carte des sols de Belgique : texture, drainage et profil de chaque zone.",
    options: { "order" => 4 }
  },
  {
    key: "cadastre", name: "Plan cadastral", group_name: "milieux", category: "overlay", kind: "wms",
    url: "#{cadgis}/services/WMS/Cadastral_Layers/MapServer/WMSServer", layers: "Cadastral_parcel",
    identify_url: "#{cadgis}/rest/services/WMS/Cadastral_Layers/MapServer/identify",
    attribution: "© SPF Finances – AGDP", opacity: 1.0, position: 140, min_zoom: 15, max_zoom: 20,
    proxied: true, enabled: true, description: "Les limites et numéros des parcelles cadastrales.",
    options: { "identify" => { "layers" => "11", "formatter" => "cadastre", "tolerance" => 0 }, "order" => 1, "role" => "cadastre" }
  }
]

legends = YAML.load_file(Rails.root.join("db/seeds/layer_legends.yml")).fetch("flanders", {})
catalogue.each do |attributes|
  layer = flanders.layers.find_or_initialize_by(key: attributes[:key])
  next if layer.persisted? && layer.options["locked"]
  legend = legends[attributes[:key]]
  attributes = attributes.merge(options: attributes[:options].merge("legend" => legend)) if legend
  layer.assign_attributes(attributes.except(:key))
  layer.save!
end
