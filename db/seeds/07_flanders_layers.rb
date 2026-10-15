# The map catalogue of Flanders: the open geo web services of Digitaal
# Vlaanderen (geo.api.vlaanderen.be, free reuse with attribution under the
# Flemish "Modellicentie Gratis Hergebruik") and the Databank Ondergrond
# Vlaanderen soil map. All WMS, GetMap in EPSG:3857 checked on 2026-10-15.
#
# - Aerial photos: the latest winter ortho (OMWRGBMRVL `Ortho`, 15 cm,
#   flown late winter: the ground shows), the 2024 summer ortho (OMZ, leaves on), 1971 (OKZ,
#   black and white) and the Ferraris map (HISTCART, around 1777).
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

photo = lambda do |key, name, service, layer, position, description:, default: false|
  options = { "format" => "image/jpeg", "order" => position }
  options["default"] = true if default
  {
    key:, name:, group_name: "photos", category: "base", kind: "wms", url: "#{vlaanderen}/#{service}/wms", layers: layer,
    identify_url: nil, attribution:, opacity: 1.0, position:, min_zoom: nil, max_zoom: 20,
    proxied: true, enabled: true, description:, options:
  }
end

catalogue = [
  photo.("ortho", "Photo d'hiver", "OMWRGBMRVL", "Ortho", 20, default: true,
         description: "La photo aérienne d'hiver la plus récente, à 15 cm : arbres presque nus, on voit mieux le sol, les fossés et les haies."),
  photo.("ortho_ete", "Photo d'été 2024", "OMZ", "OMZRGB24VL", 25,
         description: "La photo aérienne de l'été 2024 : les arbres en feuilles, l'ombre qu'ils portent."),
  photo.("ortho_1971", "Photo 1971", "OKZ", "OKZPAN71VL", 40,
         description: "Photo aérienne de 1971, en noir et blanc : haies, vergers et chemins disparus."),
  photo.("ferraris", "Carte de Ferraris (vers 1777)", "HISTCART", "ferraris", 45,
         description: "La carte des Pays-Bas autrichiens dressée vers 1777 : bois, prés, vergers et chemins d'il y a 250 ans."),
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
