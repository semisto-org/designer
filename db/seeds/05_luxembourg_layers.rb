# The map catalogue of Luxembourg: geoportail.lu open data (Administration
# du cadastre et de la topographie, ACT), CC0. Raster tiles come from the
# REST WMTS, each layer in the tile matrix set it declares
# (GLOBAL_WEBMERCATOR for the topographic maps, GLOBAL_WEBMERCATOR_4_V3 for
# the rest), 256 px, through our tile relay. Checked on 2026-10-04 from
# GetCapabilities and one tile per layer. No open contour, soil or
# Natura 2000 layer: the European ones are inherited.
#
# The cadastre is picked through the INSPIRE WFS (settings "cadastre",
# Providers::Cadastre::InspireWfs).
# Idempotent; a layer with `options.locked` keeps its database edits.
luxembourg = Region.find_by!(key: "luxembourg")

act = '© <a href="https://www.geoportail.lu" target="_blank" rel="noopener">ACT – geoportail.lu</a>'
tile = lambda do |key, name, group, layer, position:, description:, order:, category: "overlay", ext: "png",
                  matrix: "GLOBAL_WEBMERCATOR_4_V3", opacity: 0.7, min_zoom: nil, max_zoom: 19, options: {}|
  extra = { "order" => order, "tile_size" => 256 }
  extra["format"] = "image/jpeg" if ext == "jpeg"
  {
    key:, name:, group_name: group, category:, kind: "xyz",
    url: "https://wmts1.geoportail.lu/opendata/wmts/#{layer}/#{matrix}/{z}/{x}/{y}.#{ext}", layers: nil,
    identify_url: nil, legend_url: nil, attribution: act, opacity:, position:, min_zoom:, max_zoom:,
    proxied: true, enabled: true, description:, options: extra.merge(options)
  }
end

catalogue = [
  tile.("ortho", "Photo aérienne", "photos", "ortho_latest", category: "base", ext: "jpeg",
        opacity: 1.0, position: 20, order: 20, options: { "default" => true },
        description: "La photo aérienne la plus récente du Luxembourg : le terrain tel qu'il est aujourd'hui."),
  tile.("topo", "Carte topographique", "plan", "topomap", category: "base", matrix: "GLOBAL_WEBMERCATOR",
        opacity: 1.0, position: 15, order: 15, max_zoom: 18,
        description: "La carte topographique de l'ACT : relief, chemins, bâtiments et lieux-dits."),
  tile.("ombrage", "Relief ombré (LiDAR)", "terrain", "lidar_2019_mnt_public",
        opacity: 0.6, position: 50, order: 1,
        description: "Le relief du sol nu vu par le LiDAR de 2019 : talus, fossés, anciennes terrasses."),
  tile.("cadastre", "Plan cadastral", "milieux", "parcels",
        opacity: 1.0, position: 140, order: 1, min_zoom: 13,
        options: { "role" => "cadastre", "parcels" => true },
        description: "Les limites des parcelles cadastrales.")
]

catalogue.each do |attributes|
  layer = luxembourg.layers.find_or_initialize_by(key: attributes[:key])
  next if layer.persisted? && layer.options["locked"]
  layer.assign_attributes(attributes.except(:key))
  layer.save!
end

luxembourg.update!(settings: luxembourg.settings.merge(
  "cadastre" => { "provider" => "inspire_wfs", "url" => "https://wms.inspire.geoportail.lu/geoserver/cp/wfs",
                  "type_name" => "cp:CP.CadastralParcel" }
))
