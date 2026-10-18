# Where a species grows on the maps a person can open: the plant points of
# that species on their own maps, the maps shared with them and their teams'
# maps, for the map on the species sheet. Never another person's private
# map: the sheet's counts over every garden stay anonymous (PlantObservation).
#
# A point is « en terre » when it has a planting date or an observation
# (same rule as PlantObservation.in_ground_plants), else « prévu ».
class SpeciesPlantings
  LIMIT = 5000

  POINTS_SQL = <<~SQL.squish.freeze
    SELECT f.id, f.map_id, ST_X(ST_PointOnSurface(f.geometry)) AS lng, ST_Y(ST_PointOnSurface(f.geometry)) AS lat,
           f.properties->>'planted_on' AS planted_on, f.properties->>'planted_on_precision' AS planted_precision,
           CASE WHEN f.properties->>'variety_id' ~ '^[0-9]+$' THEN (f.properties->>'variety_id')::bigint END AS variety_id,
           EXISTS (SELECT 1 FROM plant_observations o WHERE o.map_feature_id = f.id) AS observed
    FROM map_features f
    WHERE f.kind = 'plant' AND f.status = 'active'
      AND f.properties->>'species_id' = $1
      AND f.map_id = ANY($2::bigint[])
    ORDER BY f.map_id, f.id
    LIMIT #{LIMIT}
  SQL

  attr_reader :species, :user

  def initialize(species, user)
    @species = species
    @user = user
  end

  # Active maps the person can open (as on « Mes cartes »).
  def maps
    @maps ||= user.openable_maps.order(:id).to_a
  end

  def points
    @points ||= if maps.empty?
      []
    else
      ids = "{#{maps.map(&:id).join(',')}}"
      MapFeature.connection.select_all(POINTS_SQL, "species plantings", [ species.id.to_s, ids ]).map do |row|
        planted_on = row["planted_on"].presence
        {
          id: row["id"], mapId: row["map_id"], lng: row["lng"].to_f.round(7), lat: row["lat"].to_f.round(7),
          inGround: planted_on.present? || row["observed"], plantedOn: planted_on,
          plantedPrecision: (row["planted_precision"].presence if planted_on), varietyId: row["variety_id"]
        }
      end
    end
  end

  def as_json(*)
    counts = points.group_by { |p| p[:mapId] }
    varieties = species.varieties.index_by(&:id)
    {
      points: points.map { |p| p.merge(variety: varieties[p[:varietyId]]&.name).except(:varietyId) },
      maps: maps.filter_map do |map|
        mine = counts[map.id] or next
        { id: map.id, name: map.name, inGround: mine.count { |p| p[:inGround] }, planned: mine.count { |p| !p[:inGround] } }
      end,
      inGround: points.count { |p| p[:inGround] },
      planned: points.count { |p| !p[:inGround] },
      truncated: points.size >= LIMIT
    }
  end
end
