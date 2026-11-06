# The map catalogue of France: the IGN Géoplateforme (data.geopf.fr), open
# data under the Licence Ouverte 2.0 (Etalab), reusable commercially with
# attribution. Raster tiles come from the WMTS in the "PM" (Web Mercator)
# tile matrix set, 256 px, through our tile relay. Checked on 2026-10-04:
# layer ids, styles and formats from GetCapabilities, one tile per layer.
#
# The cadastre is picked through the IGN API Carto (settings "cadastre",
# Providers::Cadastre::Apicarto); Natura 2000 comes from the WMS-V (it is
# not in the WMTS) and replaces the European layer of the same key.
# Idempotent; a layer with `options.locked` keeps its database edits.
france = Region.find_by!(key: "france")

ign = '© <a href="https://geoservices.ign.fr" target="_blank" rel="noopener">IGN – Géoplateforme</a>'
wmts = lambda do |layer, format: "image/png", style: "normal"|
  "https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=#{layer}" \
    "&STYLE=#{ERB::Util.url_encode(style)}&TILEMATRIXSET=PM&FORMAT=#{format}&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}"
end
legends = "https://data.geopf.fr/annexes/ressources/legendes"
tile = lambda do |key, name, group, layer, position:, description:, order:, category: "overlay", format: "image/png",
                  style: "normal", opacity: 0.7, min_zoom: nil, max_zoom: 18, attribution: ign, legend_url: nil, options: {}|
  extra = { "order" => order, "tile_size" => 256 }
  extra["format"] = format if format != "image/png"
  {
    key:, name:, group_name: group, category:, kind: "xyz", url: wmts.(layer, format:, style:), layers: nil,
    identify_url: nil, legend_url:, attribution:, opacity:, position:, min_zoom:, max_zoom:,
    proxied: true, enabled: true, description:, options: extra.merge(options)
  }
end

# The IGN mosaics of each period, on the timeline of the « Couches » panel.
# The yearly layers (ORTHOPHOTOS2021…) each cover only the départements
# flown that year: the mosaics cover the whole country. The historical
# ones (before 2000) have gaps (`partial`, transparent PNG outside the
# scanned flights): Terranova checks each map's place before offering them.
# Checked on 2026-11-06 from the WMTS GetCapabilities.
periods = [
  [ "1950_1965", "ORTHOIMAGERY.ORTHOPHOTOS.1950-1965", 1950, true, 18,
    "Photos aériennes de 1950 à 1965, en noir et blanc : bocages, vergers et chemins d'il y a soixante-dix ans." ],
  [ "1965_1980", "ORTHOIMAGERY.ORTHOPHOTOS.1965-1980", 1965, true, 18, nil ],
  [ "1980_1995", "ORTHOIMAGERY.ORTHOPHOTOS.1980-1995", 1980, true, 18, nil ],
  [ "2000_2005", "ORTHOIMAGERY.ORTHOPHOTOS2000-2005", 2000, false, 18, nil ],
  [ "2006_2010", "ORTHOIMAGERY.ORTHOPHOTOS2006-2010", 2006, false, 18, nil ],
  [ "2011_2015", "ORTHOIMAGERY.ORTHOPHOTOS2011-2015", 2011, false, 18, nil ],
  [ "2016_2020", "ORTHOIMAGERY.ORTHOPHOTOS2016-2020", 2016, false, 18, nil ],
  [ "2021_2023", "ORTHOIMAGERY.ORTHOPHOTOS2021-2023", 2021, false, 19, nil ]
]
photos = periods.each_with_index.map do |(suffix, layer, year, partial, max_zoom, description), index|
  label = suffix.tr("_", "-")
  options = { "year" => year, "vintage" => label }
  options["partial"] = true if partial
  description ||= "Photos aériennes de #{label.sub("-", " à ")} : comparer avec aujourd'hui ce qui a poussé, disparu ou changé."
  description += " Ces photos ne couvrent pas toute la France." if partial
  # The historical mosaics only have the style that turns their black
  # margins transparent.
  tile.("ortho_#{suffix}", "Photo #{label}", "photos", layer, category: "base", format: partial ? "image/png" : "image/jpeg",
        style: partial ? "BDORTHOHISTORIQUE" : "normal",
        opacity: 1.0, position: 21 + index, order: 21 + index, max_zoom:, options:, description:)
end

catalogue = [
  # -- Base maps ---------------------------------------------------------
  *photos,
  tile.("ortho", "Photo aérienne la plus récente", "photos", "ORTHOIMAGERY.ORTHOPHOTOS", category: "base", format: "image/jpeg",
        opacity: 1.0, position: 30, order: 30, max_zoom: 19,
        options: { "default" => true, "latest" => true, "vintage" => "la plus récente" },
        description: "La photo aérienne la plus récente de l'IGN : le terrain tel qu'il est aujourd'hui."),
  tile.("ortho_irc", "Photo la plus récente en infrarouge", "photos", "ORTHOIMAGERY.ORTHOPHOTOS.IRC", category: "base",
        format: "image/jpeg", opacity: 1.0, position: 30, order: 30, max_zoom: 19,
        options: { "infrared_of" => "ortho", "latest" => true, "vintage" => "la plus récente" },
        description: "En infrarouge fausses couleurs : la végétation en pleine santé ressort en rouge vif, l'eau et les sols " \
                     "humides en sombre. Utile pour repérer les zones humides et les plantes qui souffrent."),
  tile.("plan_ign", "Plan IGN", "plan", "GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2", category: "base",
        opacity: 1.0, position: 15, order: 15, max_zoom: 19,
        description: "Le plan de l'IGN : routes, chemins, bâtiments, cours d'eau et lieux-dits."),

  # -- Relief, sol et eau ------------------------------------------------
  tile.("ombrage", "Relief ombré (LiDAR)", "terrain", "IGNF_LIDAR-HD_MNT_ELEVATION.ELEVATIONGRIDCOVERAGE.SHADOW",
        opacity: 0.6, position: 50, order: 1, max_zoom: 18,
        description: "Le relief du sol nu vu par le LiDAR HD : talus, fossés, anciennes terrasses."),
  tile.("courbes", "Courbes de niveau", "terrain", "ELEVATION.CONTOUR.LINE",
        opacity: 0.9, position: 55, order: 2, min_zoom: 6, max_zoom: 18,
        description: "Les lignes d'égale altitude : plus elles sont serrées, plus la pente est forte."),
  # ELEVATION.SLOPES.HIGHRES only covers a strip near Marseille: the
  # agricultural slope map covers the whole of mainland France.
  tile.("pentes", "Pentes", "terrain", "GEOGRAPHICALGRIDSYSTEMS.SLOPES.PAC", style: "GEOGRAPHICALGRIDSYSTEMS.SLOPES.PAC",
        opacity: 0.5, position: 60, order: 3, min_zoom: 6, max_zoom: 15,
        description: "Les pentes de plus de 10 % (RGE ALTI, au pas de 5 m) : utile pour placer baissières, terrasses et chemins."),
  tile.("cours_eau", "Cours d'eau et plans d'eau", "terrain", "HYDROGRAPHY.HYDROGRAPHY",
        opacity: 0.9, position: 70, order: 4, min_zoom: 6, max_zoom: 18,
        description: "Rivières, ruisseaux, fossés, mares et étangs de la BD TOPO."),
  tile.("sols", "Carte des sols", "terrain", "INRA.CARTE.SOLS", style: "CARTE DES SOLS",
        opacity: 0.7, position: 80, order: 5, min_zoom: 6, max_zoom: 16,
        attribution: "#{ign}, INRAE – Gis Sol", legend_url: "#{legends}/INRA.CARTE.SOLS-legend.png",
        description: "Les grands types de sol (INRAE, Gis Sol) : une carte à petite échelle, à confirmer sur ton terrain."),
  tile.("foret", "Forêts", "terrain", "LANDCOVER.FORESTINVENTORY.V2",
        opacity: 0.6, position: 90, order: 6, min_zoom: 6, max_zoom: 16,
        legend_url: "#{legends}/LANDCOVER.FORESTINVENTORY.V2-legend.png",
        description: "Les forêts et leurs essences dominantes (BD Forêt v2 de l'IGN)."),

  # -- Milieux et règles -------------------------------------------------
  tile.("cadastre", "Plan cadastral", "milieux", "CADASTRALPARCELS.PARCELLAIRE_EXPRESS",
        opacity: 1.0, position: 140, order: 1, min_zoom: 13, max_zoom: 19,
        attribution: "#{ign}, DGFiP",
        options: { "role" => "cadastre", "parcels" => true },
        description: "Les limites et numéros des parcelles cadastrales (Parcellaire Express)."),
  tile.("parcellaire_agricole", "Parcellaire agricole", "milieux", "LANDUSE.AGRICULTURE.LATEST",
        opacity: 0.6, position: 150, order: 5, min_zoom: 6, max_zoom: 16,
        attribution: "#{ign}, ASP", legend_url: "#{legends}/LANDUSE-AGRICULTURE-legend.png",
        description: "Les parcelles agricoles déclarées et leur culture (registre parcellaire graphique)."),
  {
    key: "natura2000", name: "Natura 2000", group_name: "milieux", category: "overlay", kind: "wms",
    url: "https://data.geopf.fr/wms-v/ows", layers: "Patrinat_SIC_France,Patrinat_ZPS_France", identify_url: nil,
    legend_url: nil, attribution: "#{ign}, PatriNat (OFB, MNHN)", opacity: 0.5, position: 160,
    min_zoom: nil, max_zoom: 18, proxied: true, enabled: true,
    description: "Sites protégés du réseau Natura 2000 (habitats et oiseaux) : des règles particulières peuvent s'y appliquer.",
    options: { "order" => 3 }
  },
  {
    key: "znieff", name: "ZNIEFF", group_name: "milieux", category: "overlay", kind: "wms",
    url: "https://data.geopf.fr/wms-v/ows", layers: "Patrinat_ZNIEFF1_France,Patrinat_ZNIEFF2_France", identify_url: nil,
    legend_url: nil, attribution: "#{ign}, PatriNat (OFB, MNHN)", opacity: 0.4, position: 170,
    min_zoom: nil, max_zoom: 18, proxied: true, enabled: true,
    description: "Zones naturelles d'intérêt écologique, faunistique et floristique : un inventaire, pas une protection.",
    options: { "order" => 4 }
  }
]

legends = YAML.load_file(Rails.root.join("db/seeds/layer_legends.yml")).fetch("france", {})
catalogue.each do |attributes|
  layer = france.layers.find_or_initialize_by(key: attributes[:key])
  next if layer.persisted? && layer.options["locked"]
  legend = legends[attributes[:key]]
  attributes = attributes.merge(options: attributes[:options].merge("legend" => legend)) if legend
  layer.assign_attributes(attributes.except(:key))
  layer.save!
end

france.update!(settings: france.settings.merge(
  "cadastre" => { "provider" => "apicarto", "url" => "https://apicarto.ign.fr/api/cadastre/parcelle" }
))
