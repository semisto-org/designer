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

# Every flight geoportail.lu publishes, on the timeline of the « Couches »
# panel (ortho_latest is the summer 2025 flight today, so that one has no
# entry of its own). Checked on 2026-11-06 from the WMTS GetCapabilities.
flights = [
  [ "1967", 1967, nil, "Photo aérienne de 1967, en noir et blanc : haies, vergers et chemins disparus." ],
  *[ 2001, 2004, 2007, 2010, 2013, 2016, 2017, 2018 ].map { |year| [ year.to_s, year, nil, nil ] },
  [ "2019", 2019, nil, nil ], [ "2019_winter", 2019, "winter", nil ],
  *[ 2020, 2021, 2022, 2023 ].map { |year| [ year.to_s, year, nil, nil ] },
  [ "2025_winter", 2025, "winter", nil ]
]
photos = flights.map do |suffix, year, season, description|
  label = season ? "hiver #{year}" : year.to_s
  position = year < 2000 ? 16 : 20 + ((year - 2000) / 2)
  tile.("ortho_#{suffix.sub("winter", "hiver")}", season ? "Photo d'hiver #{year}" : "Photo #{year}", "photos", "ortho_#{suffix}",
        category: "base", ext: "jpeg", opacity: 1.0, position:, order: position,
        options: { "year" => year, "vintage" => label, "season" => season }.compact,
        description: description || (season ? "La photo aérienne de l'hiver #{year} : arbres nus, on voit le sol, les fossés et les haies." :
                                               "Photo aérienne de #{year} : comparer avec aujourd'hui ce qui a poussé, disparu ou changé."))
end
photos << tile.("ortho_ir", "Photo 2010 en infrarouge", "photos", "ortho_irc", category: "base", ext: "jpeg",
                opacity: 1.0, position: 25, order: 25, options: { "year" => 2010, "vintage" => "2010", "infrared_of" => "ortho_2010" },
                description: "En infrarouge fausses couleurs (vol de 2010) : la végétation en pleine santé ressort en rouge vif, " \
                             "l'eau et les sols humides en sombre. Utile pour repérer les zones humides et les plantes qui souffrent.")

catalogue = [
  *photos,
  tile.("ortho", "Photo aérienne la plus récente", "photos", "ortho_latest", category: "base", ext: "jpeg",
        opacity: 1.0, position: 45, order: 45,
        options: { "default" => true, "latest" => true, "vintage" => "la plus récente" },
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

legends = YAML.load_file(Rails.root.join("db/seeds/layer_legends.yml")).fetch("luxembourg", {})
catalogue.each do |attributes|
  layer = luxembourg.layers.find_or_initialize_by(key: attributes[:key])
  next if layer.persisted? && layer.options["locked"]
  legend = legends[attributes[:key]]
  attributes = attributes.merge(options: attributes[:options].merge("legend" => legend)) if legend
  layer.assign_attributes(attributes.except(:key))
  layer.save!
end

luxembourg.update!(settings: luxembourg.settings.merge(
  "cadastre" => { "provider" => "inspire_wfs", "url" => "https://wms.inspire.geoportail.lu/geoserver/cp/wfs",
                  "type_name" => "cp:CP.CadastralParcel" }
))
