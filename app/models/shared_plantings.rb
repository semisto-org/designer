# Where a species is in the ground on other people's places, for its sheet
# (« Dans d'autres jardins »): only the places whose owners chose to show
# their plants (MapPlaceOwners), never a map the person already opens (those
# are in SpeciesPlantings). It says what grows there and since when, the
# region and a rounded distance from the person's nearest map; never the
# map's name, its address, its exact place or its people. Contacts are
# exchanged only when an owner accepts a request (PropagationRequest).
#
# A plant counts when it is in the ground: a planting date or an observation
# (the rule of SpeciesPlantings), and not marked as planned.
class SharedPlantings
  LIMIT = 50
  # Distances are rounded to this, so a place cannot be pinned down.
  DISTANCE_STEP_KM = 5

  HOLDINGS_SQL = <<~SQL.squish.freeze
    SELECT f.map_id,
           CASE WHEN f.properties->>'variety_id' ~ '^[0-9]+$' THEN (f.properties->>'variety_id')::bigint END AS variety_id,
           count(*) AS plants,
           min(CASE WHEN f.properties->>'planted_on' ~ '^[0-9]{4}' THEN left(f.properties->>'planted_on', 4)::int END) AS since
    FROM map_features f
    WHERE f.kind = 'plant' AND f.status = 'active' AND f.deleted_at IS NULL
      AND f.properties->>'species_id' = $1
      AND f.map_id = ANY($2::bigint[])
      AND coalesce(f.properties->>'planned', 'false') <> 'true'
      AND (coalesce(f.properties->>'planted_on', '') <> ''
           OR EXISTS (SELECT 1 FROM plant_observations o WHERE o.map_feature_id = f.id))
    GROUP BY 1, 2
  SQL

  # Rows { map_id:, variety_id:, plants:, since: } of the species in the
  # ground on these maps.
  def self.holdings(species_id, map_ids)
    return [] if map_ids.empty?
    MapFeature.connection.select_all(HOLDINGS_SQL, "shared plantings", [ species_id.to_s, "{#{map_ids.join(',')}}" ]).map do |row|
      { map_id: row["map_id"], variety_id: row["variety_id"], plants: row["plants"].to_i, since: row["since"]&.to_i }
    end
  end

  # Is this species (and cultivar, when given) in the ground on this map?
  def self.in_ground?(map, species_id, variety_id)
    holdings(species_id, [ map.id ]).any? { |row| variety_id.nil? || row[:variety_id] == variety_id.to_i }
  end

  # The maps shown to other gardeners: active, shared, with an owner left.
  def self.shared_maps
    Map.active.where(shares_planted_palette: true).where(id: MapMembership.where(place_owner: true).select(:map_id))
  end

  attr_reader :species, :user

  def initialize(species, user)
    @species = species
    @user = user
  end

  def as_json(*)
    places.first(LIMIT)
  end

  private
    def places
      maps = self.class.shared_maps.where.not(id: user.openable_maps.select(:id)).where.not(id: user.map_memberships.select(:map_id))
                 .includes(:region).index_by(&:id)
      rows = self.class.holdings(species.id, maps.keys).group_by { |row| row[:map_id] }
      return [] if rows.empty?

      varieties = species.varieties.where(id: rows.values.flatten.filter_map { |r| r[:variety_id] }).index_by(&:id)
      requested = PropagationRequest.where(requester: user, map_id: rows.keys, species:, status: "pending").pluck(:map_id, :variety_id).to_set
      rows.map do |map_id, holdings|
        map = maps.fetch(map_id)
        near = nearest(map)
        {
          id: map.id,
          region: map.region&.name,
          distanceKm: near && rounded(near[:km]),
          nearMap: near && near[:name],
          acceptsRequests: map.accepts_propagation_requests,
          plants: holdings.sort_by { |h| [ h[:variety_id] ? 0 : 1, h[:since] || 9999 ] }.map do |h|
            variety = varieties[h[:variety_id]]
            { varietyId: variety&.id, variety: variety&.name, count: h[:plants], since: h[:since], requested: requested.include?([ map_id, variety&.id ]) }
          end
        }
      end.sort_by { |place| [ place[:distanceKm] || Float::INFINITY, place[:id] ] }
    end

    def own_points
      @own_points ||= user.openable_maps.where.not(center: nil).pluck(:name, :center)
    end

    def nearest(map)
      return nil unless map.center
      own_points.map { |name, point| { name:, km: haversine_km(point, map.center) } }.min_by { |n| n[:km] }
    end

    def rounded(km) = [ (km / DISTANCE_STEP_KM).round * DISTANCE_STEP_KM, DISTANCE_STEP_KM ].max

    def haversine_km(a, b)
      rad = Math::PI / 180
      dlat = (b.y - a.y) * rad
      dlng = (b.x - a.x) * rad
      h = Math.sin(dlat / 2)**2 + Math.cos(a.y * rad) * Math.cos(b.y * rad) * Math.sin(dlng / 2)**2
      2 * 6371.0 * Math.asin(Math.sqrt(h))
    end
end
