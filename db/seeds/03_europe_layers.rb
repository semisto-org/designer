# The pan-European catalogue ("europe" region), inherited by every region:
# a region replaces a layer by giving its own the same key (Wallonia's
# "plan" and "natura2000", France's "natura2000"). Coarse data, available
# everywhere, all reusable commercially with attribution:
# - OpenFreeMap / OpenStreetMap (ODbL);
# - Natura 2000 and Corine Land Cover 2018: European Environment Agency
#   (EEA, reuse with attribution; CLC is Copernicus Land Monitoring Service);
# - SoilGrids 250 m: ISRIC — World Soil Information (CC BY 4.0).
# Idempotent; a layer with `options.locked` keeps its database edits.
europe = Region.find_by!(key: Region::EUROPE_KEY)

eea_wms = ->(service) { "https://#{service}/MapServer/WMSServer" }
legend = ->(base, layer) { "#{base}#{base.include?("?") ? "&" : "?"}SERVICE=WMS&VERSION=1.3.0&REQUEST=GetLegendGraphic&FORMAT=image/png&LAYER=#{layer}" }
natura = eea_wms.("bio.discomap.eea.europa.eu/arcgis/services/ProtectedSites/Natura2000Sites")
corine = eea_wms.("image.discomap.eea.europa.eu/arcgis/services/Corine/CLC2018_WM")
soilgrids = ->(property) { "https://maps.isric.org/mapserv?map=/map/#{property}.map" }
eea = "© Agence européenne pour l'environnement (EEA)"
isric = '© <a href="https://soilgrids.org" target="_blank" rel="noopener">ISRIC SoilGrids</a> (CC BY 4.0)'

catalogue = [
  {
    key: "plan", name: "Plan", group_name: "plan", category: "base", kind: "style",
    url: "https://tiles.openfreemap.org/styles/positron", layers: nil, identify_url: nil,
    attribution: '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> ' \
                 '© <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">OpenMapTiles</a> ' \
                 'Données © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">contributeurs OpenStreetMap</a>',
    opacity: 1.0, position: 10, min_zoom: nil, max_zoom: nil, proxied: false, enabled: true, legend_url: nil,
    description: "Fond neutre : routes, bâtiments, cours d'eau et noms de lieux.",
    options: {
      "order" => 10,
      "fallback" => {
        "url" => "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
        "attribution" => '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>'
      }
    }
  },
  {
    key: "natura2000", name: "Natura 2000", group_name: "milieux", category: "overlay", kind: "wms",
    url: natura, layers: "0,1,2", identify_url: nil, legend_url: legend.(natura, "0"), attribution: eea,
    opacity: 0.5, position: 210, min_zoom: nil, max_zoom: 16, proxied: true, enabled: true,
    description: "Sites protégés du réseau européen Natura 2000 : des règles particulières peuvent s'y appliquer.",
    options: { "order" => 3 }
  },
  {
    key: "corine", name: "Occupation du sol (Europe)", group_name: "milieux", category: "overlay", kind: "wms",
    url: corine, layers: "12", identify_url: nil, legend_url: legend.(corine, "12"), attribution: "#{eea}, Copernicus",
    opacity: 0.5, position: 220, min_zoom: nil, max_zoom: 14, proxied: true, enabled: true,
    description: "Forêts, prairies, cultures, zones bâties : Corine Land Cover 2018, par unités de 25 ha au moins.",
    options: { "order" => 20 }
  },
  {
    key: "sol_ph", name: "pH du sol (Europe)", group_name: "terrain", category: "overlay", kind: "wms",
    url: soilgrids.("phh2o"), layers: "phh2o_0-5cm_mean", identify_url: nil,
    legend_url: legend.(soilgrids.("phh2o"), "phh2o_0-5cm_mean"), attribution: isric,
    opacity: 0.6, position: 230, min_zoom: nil, max_zoom: 13, proxied: true, enabled: true,
    description: "pH estimé des 5 premiers centimètres, par mailles de 250 m (SoilGrids). Un ordre de grandeur : seule une analyse dit le pH de ton sol.",
    options: { "order" => 20 }
  },
  {
    key: "sol_argile", name: "Argile du sol (Europe)", group_name: "terrain", category: "overlay", kind: "wms",
    url: soilgrids.("clay"), layers: "clay_0-5cm_mean", identify_url: nil,
    legend_url: legend.(soilgrids.("clay"), "clay_0-5cm_mean"), attribution: isric,
    opacity: 0.6, position: 240, min_zoom: nil, max_zoom: 13, proxied: true, enabled: true,
    description: "Part d'argile estimée en surface, par mailles de 250 m (SoilGrids) : un sol lourd ou léger, à confirmer sur place.",
    options: { "order" => 21 }
  }
]

catalogue.each do |attributes|
  layer = europe.layers.find_or_initialize_by(key: attributes[:key])
  next if layer.persisted? && layer.options["locked"]
  layer.assign_attributes(attributes.except(:key))
  layer.save!
end
