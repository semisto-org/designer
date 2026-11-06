# The aerial photos of a region through time: every flight a region's
# geoportal publishes (Wallonia from 1971, Flanders, Brussels, Luxembourg,
# the IGN mosaics in France), seeded as base layers of the « photos » group
# with their year, season and infrared twin (`options`). The « Couches »
# panel lays them on a timeline; the MCP lists them and shows any of them
# over the terrain (get_aerial_photo).
module PhotoArchive
  module_function

  # The photo layers of a region (inherited ones included), oldest first,
  # the « latest » layer (no year) last. Infrared twins are included: see
  # RegionLayer#infrared?.
  def layers(region)
    region.catalogue.enabled.select(&:photo?).sort_by { |layer| sort_key(layer) }
  end

  # The base maps to choose a place on (new map, region lookup): the plans
  # and the default photo, not the whole timeline.
  def preview_bases(region)
    region.catalogue.enabled.bases.reject { |layer| layer.photo? && !layer.default? }
  end

  # One entry per flight for an AI or an API client: the true colour layer
  # and, when there is one, its infrared twin.
  def vintages(region, uncovered: [])
    all = layers(region)
    infrared = all.select(&:infrared?).index_by { |layer| layer.option(:infrared_of) }
    all.reject(&:infrared?).map do |layer|
      {
        key: layer.key, name: layer.name, label: layer.option(:vintage).presence || layer.name,
        year: layer.option(:year), season: layer.option(:season), latest: layer.option(:latest) == true || nil,
        default: layer.default? || nil, infrared_key: infrared[layer.key]&.key,
        covers_map: (uncovered.include?(layer.key) ? false : nil)
      }.compact
    end
  end

  # [x, y] in EPSG:3857 metres.
  def mercator(lon, lat)
    origin = Providers::TileMath::ORIGIN
    [ lon * origin / 180.0, Math.log(Math.tan((90 + lat) * Math::PI / 360.0)) * origin / Math::PI ]
  end

  def sort_key(layer)
    [ layer.option(:latest) ? 1 : 0, layer.option(:year).to_i, layer.position.to_i, layer.infrared? ? 1 : 0 ]
  end
end
