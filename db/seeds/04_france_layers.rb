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
tile = lambda do |key, name, group, layer, position:, description:, order:, category: "overlay", format: "image/png",
                  style: "normal", opacity: 0.7, min_zoom: nil, max_zoom: 18, attribution: ign, options: {}|
  extra = { "order" => order, "tile_size" => 256 }
  extra["format"] = format if format != "image/png"
  {
    key:, name:, group_name: group, category:, kind: "xyz", url: wmts.(layer, format:, style:), layers: nil,
    identify_url: nil, legend_url: nil, attribution:, opacity:, position:, min_zoom:, max_zoom:,
    proxied: true, enabled: true, description:, options: extra.merge(options)
  }
end

catalogue = [
  # -- Base maps ---------------------------------------------------------
  tile.("ortho", "Photo aérienne", "photos", "ORTHOIMAGERY.ORTHOPHOTOS", category: "base", format: "image/jpeg",
        opacity: 1.0, position: 20, order: 20, max_zoom: 19, options: { "default" => true },
        description: "La photo aérienne la plus récente de l'IGN : le terrain tel qu'il est aujourd'hui."),
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
  tile.("pentes", "Pentes", "terrain", "ELEVATION.SLOPES.HIGHRES",
        opacity: 0.6, position: 60, order: 3, min_zoom: 6, max_zoom: 16,
        description: "L'inclinaison du terrain, en couleurs : utile pour placer baissières, terrasses et chemins."),
  tile.("cours_eau", "Cours d'eau et plans d'eau", "terrain", "HYDROGRAPHY.HYDROGRAPHY",
        opacity: 0.9, position: 70, order: 4, min_zoom: 6, max_zoom: 18,
        description: "Rivières, ruisseaux, fossés, mares et étangs de la BD TOPO."),
  tile.("sols", "Carte des sols", "terrain", "INRA.CARTE.SOLS", style: "CARTE DES SOLS",
        opacity: 0.7, position: 80, order: 5, min_zoom: 6, max_zoom: 16,
        attribution: "#{ign}, INRAE – Gis Sol",
        description: "Les grands types de sol (INRAE, Gis Sol) : une carte à petite échelle, à confirmer sur ton terrain."),
  tile.("foret", "Forêts", "terrain", "LANDCOVER.FORESTINVENTORY.V2",
        opacity: 0.6, position: 90, order: 6, min_zoom: 6, max_zoom: 16,
        description: "Les forêts et leurs essences dominantes (BD Forêt v2 de l'IGN)."),

  # -- Milieux et règles -------------------------------------------------
  tile.("cadastre", "Plan cadastral", "milieux", "CADASTRALPARCELS.PARCELLAIRE_EXPRESS",
        opacity: 1.0, position: 140, order: 1, min_zoom: 13, max_zoom: 19,
        attribution: "#{ign}, DGFiP",
        options: { "role" => "cadastre", "parcels" => true },
        description: "Les limites et numéros des parcelles cadastrales (Parcellaire Express)."),
  tile.("parcellaire_agricole", "Parcellaire agricole", "milieux", "LANDUSE.AGRICULTURE.LATEST",
        opacity: 0.6, position: 150, order: 5, min_zoom: 6, max_zoom: 16,
        attribution: "#{ign}, ASP",
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

catalogue.each do |attributes|
  layer = france.layers.find_or_initialize_by(key: attributes[:key])
  next if layer.persisted? && layer.options["locked"]
  layer.assign_attributes(attributes.except(:key))
  layer.save!
end

france.update!(settings: france.settings.merge(
  "cadastre" => { "provider" => "apicarto", "url" => "https://apicarto.ign.fr/api/cadastre/parcelle" }
))
