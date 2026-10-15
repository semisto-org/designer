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

photo = lambda do |key, name, layer, position, description:, default: false|
  options = { "format" => "image/jpeg", "order" => position }
  options["default"] = true if default
  {
    key:, name:, group_name: "photos", category: "base", kind: "wms", url: urbis, layers: layer,
    identify_url: nil, attribution: urbis_attribution, opacity: 1.0, position:, min_zoom: nil, max_zoom: 20,
    proxied: true, enabled: true, description:, options:
  }
end

catalogue = [
  photo.("ortho", "Photo aérienne", "Ortho", 20, default: true,
         description: "La photo aérienne la plus récente de Bruxelles : le terrain tel qu'il est aujourd'hui."),
  photo.("ortho_2004", "Photo 2004", "Ortho2004", 30,
         description: "Photo aérienne de 2004 : ce qui a changé en vingt ans."),
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
