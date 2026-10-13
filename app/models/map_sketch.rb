# What « Mes cartes » needs to paint each map as a field-notebook sketch:
# the palette counted per strata, and a light copy of what is drawn (plants
# with their strata and adult spread, water, hedges, buildings, existing
# trees), and the outline (simplified) with its bounding box, read from
# PostGIS: parsing a detailed outline with RGeo costs about 10 ms a map.
#
# Built for a whole list of maps at once (a few queries, never one per map),
# simplified and capped so a large design keeps the page light.
class MapSketch
  PLANT_LIMIT = 1500
  SHAPE_LIMIT = 300
  # Degrees: about 30 cm, invisible at the size of a card.
  SIMPLIFY = 0.000003

  HEDGE_KINDS = %w[hedge windbreak existing_hedge].freeze

  SHAPES_SQL = <<~SQL.squish.freeze
    SELECT map_id, group_name, geojson FROM (
      SELECT map_id,
             CASE WHEN layer = 'water' THEN 'water'
                  WHEN kind IN (#{HEDGE_KINDS.map { "'#{_1}'" }.join(", ")}) THEN 'hedges'
                  WHEN kind = 'building' THEN 'buildings'
                  ELSE 'trees' END AS group_name,
             ST_AsGeoJSON(ST_SimplifyPreserveTopology(geometry, #{SIMPLIFY}), 6) AS geojson,
             row_number() OVER (PARTITION BY map_id, layer, kind ORDER BY id) AS rank
      FROM map_features
      WHERE map_id = ANY($1::bigint[]) AND status = 'active'
        AND (layer = 'water' OR kind IN (#{(HEDGE_KINDS + %w[building existing_tree]).map { "'#{_1}'" }.join(", ")}))
        AND layer <> 'networks'
    ) shapes WHERE rank <= #{SHAPE_LIMIT}
  SQL

  PLANTS_SQL = <<~SQL.squish.freeze
    SELECT map_id, lng, lat, species_id, variety_id FROM (
      SELECT map_id,
             round(ST_X(ST_PointOnSurface(geometry))::numeric, 6)::float AS lng,
             round(ST_Y(ST_PointOnSurface(geometry))::numeric, 6)::float AS lat,
             CASE WHEN properties->>'species_id' ~ '^[0-9]+$' THEN (properties->>'species_id')::bigint END AS species_id,
             CASE WHEN properties->>'variety_id' ~ '^[0-9]+$' THEN (properties->>'variety_id')::bigint END AS variety_id,
             row_number() OVER (PARTITION BY map_id ORDER BY id) AS rank
      FROM map_features
      WHERE map_id = ANY($1::bigint[]) AND status = 'active' AND kind = 'plant'
    ) plants WHERE rank <= #{PLANT_LIMIT}
  SQL

  BOUNDARIES_SQL = <<~SQL.squish.freeze
    SELECT id, ST_AsGeoJSON(ST_SimplifyPreserveTopology(boundary, #{SIMPLIFY}), 6),
           ST_XMin(boundary), ST_YMin(boundary), ST_XMax(boundary), ST_YMax(boundary)
    FROM maps WHERE id = ANY($1::bigint[]) AND boundary IS NOT NULL
  SQL

  # { map_id => sketch json }
  def self.for(maps)
    new(maps).as_json
  end

  def initialize(maps)
    @ids = maps.map(&:id)
  end

  def as_json(*)
    return {} if @ids.empty?
    @ids.index_with do |id|
      {
        palette: palette_counts[id] || {},
        plants: plants[id] || [],
        water: shapes.dig(id, "water") || [],
        hedges: shapes.dig(id, "hedges") || [],
        buildings: shapes.dig(id, "buildings") || [],
        trees: (shapes.dig(id, "trees") || []).map { _1["coordinates"] }
      }
    end
  end

  # { map_id => { boundary: GeoJSON outline (simplified), bbox: [w, s, e, n] } },
  # for Map#as_inertia; maps without an outline are absent.
  def outlines
    @outlines ||= connection.select_rows(BOUNDARIES_SQL, "map sketch outlines", [ pg_array ])
      .to_h { |id, geojson, *bbox| [ id, { boundary: JSON.parse(geojson), bbox: bbox.map(&:to_f) } ] }
  end

  private
    def palette_items
      @palette_items ||= PaletteItem.active.where(map_id: @ids).includes(:species).to_a
    end

    # { map_id => { "canopy" => 3, … } }
    def palette_counts
      @palette_counts ||= palette_items.group_by(&:map_id).transform_values { |items| items.map(&:effective_strata).tally }
    end

    # { map_id => [[lng, lat, strata, spread_m]] }
    def plants
      @plants ||= begin
        rows = connection.select_all(PLANTS_SQL, "map sketch plants", [ pg_array ]).to_a
        species = PlantSpecies.where(id: rows.filter_map { _1["species_id"] }.uniq).index_by(&:id)
        by_key = palette_items.index_by { [ _1.map_id, _1.species_id, _1.variety_id ] }
        # Strata and spread once per species of a map, not once per plant.
        looks = Hash.new do |memo, key|
          map_id, species_id, variety_id = key
          sp = species[species_id]
          item = by_key[key] || by_key[[ map_id, species_id, nil ]]
          strata = item&.effective_strata || sp&.default_strata || "shrub"
          memo[key] = [ strata, PlantGrowth.spread(strata:, species: sp).metres.round(1) ]
        end
        rows.group_by { _1["map_id"] }.transform_values do |list|
          list.map { |row| [ row["lng"], row["lat"], *looks[[ row["map_id"], row["species_id"], row["variety_id"] ]] ] }
        end
      end
    end

    # { map_id => { "water" => [geometry], … } }
    def shapes
      @shapes ||= connection.select_all(SHAPES_SQL, "map sketch shapes", [ pg_array ]).to_a
        .group_by { _1["map_id"] }
        .transform_values { |rows| rows.group_by { _1["group_name"] }.transform_values { |g| g.map { JSON.parse(_1["geojson"]) } } }
    end

    def pg_array = "{#{@ids.join(",")}}"
    def connection = MapFeature.connection
end
