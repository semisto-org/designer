# THE single addition of a map's planting: how many plants are planned, per
# species/cultivar and in total. Every screen (plant list, palette counters,
# alerts, exports, nursery order, MCP) reads it, never its own sum.
#
#   planned  = composed + isolated
#   composed = Σ patch lines (count, or density × patch area from PostGIS)
#   isolated = plant points that are NOT a placement of a patch line
#
# A plant point lying inside an active patch whose composition already holds
# the same species/cultivar is a *placement* of that line: it counts in
# `placed`, never twice in `planned` (Terranova paid for that double count).
# Points without species are drawn but never counted (`unlinked_count`).
#
# Logic ported from Terranova (PlantedQuantities), rewritten over PostGIS.
class PlantedQuantities
  Slot = Struct.new(:composed, :isolated, :placed, :planted, :area_m2, :patch_ids, keyword_init: true) do
    def planned = composed + isolated
  end

  PatchData = Struct.new(:feature, :area_m2, :lines, keyword_init: true)
  Line = Struct.new(:item, :strata, :density, :quantity, keyword_init: true)
  PlantPoint = Struct.new(:id, :species_id, :variety_id, :planted_on, :in_patch, keyword_init: true)

  PLANTS_SQL = <<~SQL.squish.freeze
    SELECT f.id,
           CASE WHEN f.properties->>'species_id' ~ '^[0-9]+$' THEN (f.properties->>'species_id')::bigint END AS species_id,
           CASE WHEN f.properties->>'variety_id' ~ '^[0-9]+$' THEN (f.properties->>'variety_id')::bigint END AS variety_id,
           f.properties->>'planted_on' AS planted_on,
           EXISTS (
             SELECT 1 FROM map_features p JOIN patch_items i ON i.map_feature_id = p.id
             WHERE p.map_id = f.map_id AND p.kind = 'patch' AND p.status = 'active'
               AND f.properties->>'species_id' ~ '^[0-9]+$'
               AND i.species_id = (f.properties->>'species_id')::bigint
               AND i.variety_id IS NOT DISTINCT FROM
                   (CASE WHEN f.properties->>'variety_id' ~ '^[0-9]+$' THEN (f.properties->>'variety_id')::bigint END)
               AND ST_Covers(p.geometry, f.geometry)
               AND ($2::text IS NULL OR CASE WHEN $2 = '' THEN cardinality(p.tags) = 0 ELSE EXISTS (SELECT 1 FROM unnest(p.tags) t WHERE lower(t) = lower($2)) END)
           ) AS in_patch
    FROM map_features f
    WHERE f.map_id = $1 AND f.kind = 'plant' AND f.status = 'active'
      AND ($2::text IS NULL OR CASE WHEN $2 = '' THEN cardinality(f.tags) = 0 ELSE EXISTS (SELECT 1 FROM unnest(f.tags) t WHERE lower(t) = lower($2)) END)
    ORDER BY f.id
  SQL

  PATCH_AREAS_SQL = <<~SQL.squish.freeze
    SELECT id, ST_Area(geometry::geography) AS area
    FROM map_features WHERE map_id = $1 AND kind = 'patch' AND status = 'active'
      AND ($2::text IS NULL OR CASE WHEN $2 = '' THEN cardinality(tags) = 0 ELSE EXISTS (SELECT 1 FROM unnest(tags) t WHERE lower(t) = lower($2)) END)
  SQL

  attr_reader :map, :patches, :plants, :palette

  # `tag`: only the plants and patches carrying this tag (case-insensitive),
  # or `:untagged` for those without any, for the plant list filtered or
  # grouped by tag. A plant point only counts as a placement of a patch
  # line when the patch passes the same filter.
  def self.for(map, tag: nil)
    connection = MapFeature.connection
    tag = tag == :untagged ? "" : MapFeature.normalize_tag(tag).presence
    plants = connection.select_all(PLANTS_SQL, "plants", [ map.id, tag ]).map do |row|
      PlantPoint.new(id: row["id"], species_id: row["species_id"], variety_id: row["variety_id"],
                     planted_on: row["planted_on"].presence, in_patch: row["in_patch"])
    end
    areas = connection.select_rows(PATCH_AREAS_SQL, "patch areas", [ map.id, tag ]).to_h { |id, area| [ id, area.to_f.round(1) ] }
    features = map.features.where(id: areas.keys).order(:id).to_a
    items = PatchItem.where(map_feature_id: areas.keys).includes(species: :common_names, variety: :common_names)
                     .order(:position, :id).group_by(&:map_feature_id)
    palette = map.palette_items.includes(species: :common_names, variety: [ :common_names, :species ]).to_a
    new(map:, plants:, palette:, patches: features.map { |f| [ f, areas[f.id], items.fetch(f.id, []) ] })
  end

  # `patches`: [[feature, area_m2, [PatchItem]]]; `plants`: [PlantPoint].
  def initialize(map:, plants:, palette:, patches:)
    @map = map
    @plants = plants
    @palette = palette
    @palette_strata = palette.to_h { |item| [ item.key, item.strata ] }
    @patches = patches.map do |feature, area, items|
      lines = items.map do |item|
        strata = item.effective_strata(palette_strata_for(item.key))
        Line.new(item:, strata:, density: item.counted? ? nil : item.effective_density(palette_strata_for(item.key)),
                 quantity: item.quantity(area, palette_strata_for(item.key)))
      end
      PatchData.new(feature:, area_m2: area, lines:)
    end
  end

  # A cultivar not in the palette takes its species' palette strata.
  def palette_strata_for(key) = @palette_strata[key] || @palette_strata[[ key.first, nil ]]

  # { [species_id, variety_id] => Slot }
  def by_key
    @by_key ||= begin
      slots = Hash.new { |h, k| h[k] = Slot.new(composed: 0, isolated: 0, placed: 0, planted: 0, area_m2: 0.0, patch_ids: []) }
      patches.each do |patch|
        patch.lines.each do |line|
          slot = slots[line.item.key]
          slot.composed += line.quantity
          slot.area_m2 += patch.area_m2.to_f
          slot.patch_ids |= [ patch.feature.id ]
        end
      end
      plants.each do |plant|
        next unless plant.species_id
        slot = slots[[ plant.species_id, plant.variety_id ]]
        slot.placed += 1
        slot.planted += 1 if plant.planted_on
        slot.isolated += 1 unless plant.in_patch
      end
      slots
    end
  end

  def slot_for(key) = by_key.fetch(key) { Slot.new(composed: 0, isolated: 0, placed: 0, planted: 0, area_m2: 0.0, patch_ids: []) }
  def planned_for(key) = slot_for(key).planned

  def composed_total = by_key.values.sum(&:composed)
  def isolated_total = by_key.values.sum(&:isolated)
  def placed_total = by_key.values.sum(&:placed)
  def planted_total = by_key.values.sum(&:planted)
  def total = composed_total + isolated_total

  def unlinked_count = plants.count { |p| p.species_id.nil? }

  def patch(feature_id) = patches.find { |p| p.feature.id == feature_id }

  # Species and varieties of every key, loaded once.
  def species_index
    @species_index ||= PlantSpecies.where(id: by_key.keys.map(&:first) | palette.map(&:species_id))
                                   .includes(:common_names).index_by(&:id)
  end

  def variety_index
    @variety_index ||= PlantVariety.where(id: by_key.keys.filter_map(&:last) | palette.filter_map(&:variety_id))
                                   .includes(:common_names, :species).index_by(&:id)
  end

  # Strata of a key on this map: palette override, else the species default.
  def strata_for(key)
    palette_strata_for(key).presence || species_index[key.first]&.default_strata
  end
end
