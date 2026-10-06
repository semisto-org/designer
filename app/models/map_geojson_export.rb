# GeoJSON export of a map (RFC 7946, WGS84): the terrain boundary and every
# accepted feature, with its layer, kind, French labels, properties and
# PostGIS measurements. Sensitive networks (water, gas, electricity,
# ethernet) are left out unless explicitly included by an editor; AI drafts
# and rejected proposals are never exported.
class MapGeojsonExport
  SENSITIVE_LAYERS = %w[networks].freeze

  attr_reader :map

  def initialize(map, include_networks: false)
    @map = map
    @include_networks = include_networks
  end

  def include_networks? = @include_networks

  def features
    scope = map.features.where(status: "active").order(:layer, :id)
    scope = scope.where.not(layer: SENSITIVE_LAYERS) unless include_networks?
    scope
  end

  def as_json(*)
    measures = measurements
    {
      type: "FeatureCollection",
      name: map.name,
      generator: "Semisto Designer",
      exported_at: Time.current.iso8601,
      features: [ boundary_feature, *features.map { |f| feature_json(f, measures[f.id]) } ].compact
    }
  end

  def to_json(*) = JSON.generate(as_json)

  def filename
    "#{map.name.parameterize.presence || "carte"}-#{Date.current.iso8601}.geojson"
  end

  private
    def boundary_feature
      return nil unless map.boundary
      {
        type: "Feature",
        geometry: map.geometry_geojson(:boundary),
        properties: { kind: "boundary", label: I18n.t("drawing.export.boundary"), name: map.name, area_m2: map.area_m2 }
      }
    end

    def feature_json(feature, measure)
      {
        type: "Feature",
        id: feature.id,
        geometry: feature.geometry_geojson,
        properties: feature.properties.merge(
          "id" => feature.id, "layer" => feature.layer, "kind" => feature.kind,
          "layer_label" => I18n.t("editor.layers.#{feature.layer}", default: feature.layer),
          "kind_label" => MapElements.label(feature.kind),
          "name" => feature.name, "notes" => feature.notes, "source" => feature.source,
          "style" => feature.style.presence, "tags" => feature.tags.presence
        ).merge(measure || {}).compact
      }
    end

    # Area (m², polygons) and length (m, lines) on the ellipsoid, in one query.
    def measurements
      sql = <<~SQL.squish
        CASE WHEN ST_Dimension(geometry) = 2 THEN ROUND(ST_Area(geometry::geography)::numeric, 1) END,
        CASE WHEN ST_Dimension(geometry) = 1 THEN ROUND(ST_Length(geometry::geography)::numeric, 1) END
      SQL
      features.reorder(nil).pluck(:id, Arel.sql(sql)).to_h do |id, area, length|
        [ id, { "area_m2" => area&.to_f, "length_m" => length&.to_f }.compact ]
      end
    end
end
