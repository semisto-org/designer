# Super admin « Cartes »: one row per map with what it holds and how alive it
# is (palette, plants, drawing, people, comments, photos, Claude) and the disk
# space its photos and documents take, for every owner. One query: each figure
# is a correlated subquery on an indexed map_id.
module Admin
  class MapStats
    COUNTS = {
      palette: "SELECT COUNT(*) FROM palette_items x WHERE x.map_id = maps.id",
      plants: "SELECT COUNT(*) FROM map_features x WHERE x.map_id = maps.id AND x.deleted_at IS NULL AND x.status = 'active' AND x.kind = 'plant'",
      patches: "SELECT COUNT(*) FROM map_features x WHERE x.map_id = maps.id AND x.deleted_at IS NULL AND x.status = 'active' AND x.kind = 'patch'",
      features: "SELECT COUNT(*) FROM map_features x WHERE x.map_id = maps.id AND x.deleted_at IS NULL AND x.status = 'active'",
      drafts: "SELECT COUNT(*) FROM map_features x WHERE x.map_id = maps.id AND x.deleted_at IS NULL AND x.status = 'draft'",
      editors: "SELECT COUNT(*) FROM map_memberships x WHERE x.map_id = maps.id AND x.role = 'editor'",
      viewers: "SELECT COUNT(*) FROM map_memberships x WHERE x.map_id = maps.id AND x.role = 'viewer'",
      comments: "SELECT COUNT(*) FROM comments x WHERE x.map_id = maps.id AND x.deleted_at IS NULL",
      photos: "SELECT COUNT(*) FROM map_photos x WHERE x.map_id = maps.id",
      plan_images: "SELECT COUNT(*) FROM plan_images x WHERE x.map_id = maps.id",
      ai_actions: "SELECT COUNT(*) FROM ai_actions x WHERE x.map_id = maps.id"
    }.freeze

    # The latest sign of life: the map itself (touched by every drawing
    # change), a comment, a photo or a call from Claude.
    LAST_ACTIVITY = <<~SQL.squish.freeze
      GREATEST(maps.updated_at,
        (SELECT MAX(x.created_at) FROM comments x WHERE x.map_id = maps.id),
        (SELECT MAX(x.created_at) FROM map_photos x WHERE x.map_id = maps.id),
        (SELECT MAX(x.created_at) FROM ai_actions x WHERE x.map_id = maps.id))
    SQL

    # Files counted in each storage figure, by attachment record type and the
    # table that ties the record to its map. Photos include the photos of plant
    # observations and the inputs sent to Magnific; documents include the soil
    # lab reports.
    STORAGE = {
      photos: { "MapPhoto" => "map_photos", "PlantObservation" => "plant_observations", "PhotoRendering" => "photo_renderings" },
      documents: { "MapDocument" => "map_documents", "SoilSample" => "soil_samples" }
    }.freeze

    # Bytes on disk: the attached blobs plus the variants generated from them
    # (thumbnails, large previews), each blob counted once.
    def self.storage_sql(records)
      originals = records.map do |type, table|
        "SELECT a.blob_id FROM active_storage_attachments a WHERE a.record_type = '#{type}' " \
          "AND a.record_id IN (SELECT x.id FROM #{table} x WHERE x.map_id = maps.id)"
      end.join(" UNION ALL ")
      <<~SQL.squish
        WITH originals AS (#{originals})
        SELECT COALESCE(SUM(b.byte_size), 0) FROM active_storage_blobs b
        WHERE b.id IN (SELECT blob_id FROM originals)
          OR b.id IN (SELECT a.blob_id FROM active_storage_variant_records v
            JOIN active_storage_attachments a ON a.record_type = 'ActiveStorage::VariantRecord' AND a.record_id = v.id
            WHERE v.blob_id IN (SELECT blob_id FROM originals))
      SQL
    end

    PUBLISHED = "EXISTS (SELECT 1 FROM map_publications x WHERE x.map_id = maps.id AND x.unpublished_at IS NULL)"

    def self.call(scope = Map.all) = new(scope).rows

    def initialize(scope)
      @scope = scope
    end

    def rows
      columns = COUNTS.map { |key, sql| "(#{sql}) AS #{key}_count" } +
        STORAGE.map { |key, records| "(#{self.class.storage_sql(records)}) AS #{key}_bytes" }
      maps = @scope.includes(:owner, :region, :organization)
        .select("maps.*", *columns, "#{LAST_ACTIVITY} AS last_activity_at", "#{PUBLISHED} AS published")
        .order(created_at: :desc, id: :desc).to_a
      plans = maps.map(&:owner).uniq.to_h { |owner| [ owner.id, owner.current_plan_key ] }
      maps.map { |map| row(map, plans[map.owner_id]) }
    end

    private
      def row(map, plan)
        {
          id: map.id, name: map.name, stage: map.stage, region: map.region&.name, team: map.organization&.name,
          areaM2: map.area_m2&.round, archived: map.archived_at.present?, published: map.published,
          createdAt: map.created_at.iso8601, lastActivityAt: map.last_activity_at&.iso8601,
          owner: { id: map.owner_id, name: map.owner.display_name, email: map.owner.email_address, plan: },
          counts: COUNTS.keys.to_h { |key| [ key.to_s.camelize(:lower), map["#{key}_count"].to_i ] },
          storageBytes: STORAGE.keys.to_h { |key| [ key.to_s, map["#{key}_bytes"].to_i ] }
        }
      end
  end
end
