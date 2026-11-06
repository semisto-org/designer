# The map catalogue of the Brussels-Capital Region.
#
# - Aerial photos: UrbIS (paradigm.brussels), CC0, from the `urbisgrid`
#   GeoServer WMS (GetMap in EPSG:3857 checked on 2026-10-15). `Ortho` is
#   always the latest flight; `Ortho2004` is the oldest one served.
# - Cadastre: the federal cadastral layers of the SPF Finances (AGDP,
#   CadGIS), which cover the whole of Belgium. WMS `Cadastral_parcel` for the
#   drawing, ArcGIS REST identify on layer 11 to pick parcels (attributes
#   CaPaKey, CaSeKey, SuVaCn = area in m²; see Formatters#cadastre_entry).
#
# No open soil, contour or regulatory layer yet: the European ones are
# inherited. Idempotent; a layer with `options.locked` keeps its database edits.
brussels = Region.find_by!(key: "brussels")

urbis = "https://geoservices-urbis.irisnet.be/geoserver/urbisgrid/wms"
urbis_attribution = '© <a href="https://bric.brussels/fr/nos-solutions/urbis-solutions" target="_blank" rel="noopener">UrbIS – paradigm.brussels</a>'
cadgis = "https://ccff02.minfin.fgov.be/geoservices/arcgis"

photo = lambda do |key, name, layer, position, description:, default: false, year: nil, vintage: nil,
                   infrared_of: nil, latest: false|
  options = { "format" => "image/jpeg", "order" => position }
  options["default"] = true if default
  options["year"] = year if year
  options["vintage"] = vintage if vintage
  options["infrared_of"] = infrared_of if infrared_of
  options["latest"] = true if latest
  {
    key:, name:, group_name: "photos", category: "base", kind: "wms", url: urbis, layers: layer,
    identify_url: nil, attribution: urbis_attribution, opacity: 1.0, position:, min_zoom: nil, max_zoom: 20,
    proxied: true, enabled: true, description:, options:
  }
end

# Every flight UrbIS serves, on the timeline of the « Couches » panel. Some
# years were flown twice (east-west and north-south strips, `Eo` / `Ns`):
# one is enough. `Ortho` (the latest) is the 2024 north-south flight today,
# so 2024 has no entry of its own: add `Ortho2024Ns` here when UrbIS
# publishes a newer flight. Checked on 2026-11-06.
years = { 2009 => "Ortho2009", 2012 => "Ortho2012", 2014 => "Ortho2014", 2015 => "Ortho2015", 2016 => "Ortho2016",
          2017 => "Ortho2017", 2018 => "Ortho2018", 2019 => "Ortho2019", 2020 => "Ortho2020", 2021 => "Ortho2021Ns",
          2022 => "Ortho2022Ns", 2023 => "Ortho2023" }
older = years.map do |year, layer|
  photo.("ortho_#{year}", "Photo #{year}", layer, 20 + (year - 2004), year:, vintage: year.to_s,
         description: "Photo aérienne de #{year} : comparer avec aujourd'hui ce qui a poussé, disparu ou changé.")
end

catalogue = [
  photo.("ortho_2004", "Photo 2004", "Ortho2004", 20, year: 2004, vintage: "2004",
         description: "Photo aérienne de 2004 : ce qui a changé en vingt ans."),
  *older,
  photo.("ortho", "Photo aérienne la plus récente", "Ortho", 41, default: true, latest: true, vintage: "la plus récente",
         description: "La photo aérienne la plus récente de Bruxelles : le terrain tel qu'il est aujourd'hui."),
  photo.("ortho_ir", "Photo 2024 en infrarouge", "Ortho2024NirNs", 41, infrared_of: "ortho", latest: true, vintage: "la plus récente",
         description: "En infrarouge fausses couleurs (vol de 2024) : la végétation en pleine santé ressort en rouge vif, " \
                      "l'eau et les sols humides en sombre. Utile pour repérer les plantes qui souffrent."),
  {
    key: "cadastre", name: "Plan cadastral", group_name: "milieux", category: "overlay", kind: "wms",
    url: "#{cadgis}/services/WMS/Cadastral_Layers/MapServer/WMSServer", layers: "Cadastral_parcel",
    identify_url: "#{cadgis}/rest/services/WMS/Cadastral_Layers/MapServer/identify",
    attribution: "© SPF Finances – AGDP", opacity: 1.0, position: 140, min_zoom: 15, max_zoom: 20,
    proxied: true, enabled: true, description: "Les limites et numéros des parcelles cadastrales.",
    options: { "identify" => { "layers" => "11", "formatter" => "cadastre", "tolerance" => 0 }, "order" => 1, "role" => "cadastre" }
  }
]

legends = YAML.load_file(Rails.root.join("db/seeds/layer_legends.yml")).fetch("brussels", {})
catalogue.each do |attributes|
  layer = brussels.layers.find_or_initialize_by(key: attributes[:key])
  next if layer.persisted? && layer.options["locked"]
  legend = legends[attributes[:key]]
  attributes = attributes.merge(options: attributes[:options].merge("legend" => legend)) if legend
  layer.assign_attributes(attributes.except(:key))
  layer.save!
end

# The real buildings in 3D: UrbIS Buildings 3D (paradigm.brussels, CC0), a
# LoD2 model of every building of the region with its roof surfaces,
# published as one zip per square kilometre and updated every month
# (Providers::UrbisBuildings3d). The 3D relief shows them instead of the
# OpenStreetMap footprints and their guessed roofs.
brussels.settings = brussels.settings.merge(
  "buildings_3d" => {
    "provider" => "urbis",
    "label" => "UrbIS Buildings 3D (paradigm.brussels)",
    "attribution" => "© UrbIS – paradigm.brussels (bâtiments 3D, CC0)",
    "feed_url" => Providers::UrbisBuildings3d::DEFAULT_FEED
  }
)
brussels.save!
