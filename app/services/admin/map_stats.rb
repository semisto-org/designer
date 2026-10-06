# Super admin « Cartes »: one row per map with what it holds and how alive it
# is (palette, plants, drawing, people, comments, photos, Claude), for every
# owner. One query: each figure is a correlated COUNT on an indexed map_id.
module Admin
  class MapStats
    COUNTS = {
      palette: "SELECT COUNT(*) FROM palette_items x WHERE x.map_id = maps.id",
      plants: "SELECT COUNT(*) FROM map_features x WHERE x.map_id = maps.id AND x.status = 'active' AND x.kind = 'plant'",
      patches: "SELECT COUNT(*) FROM map_features x WHERE x.map_id = maps.id AND x.status = 'active' AND x.kind = 'patch'",
      features: "SELECT COUNT(*) FROM map_features x WHERE x.map_id = maps.id AND x.status = 'active'",
      drafts: "SELECT COUNT(*) FROM map_features x WHERE x.map_id = maps.id AND x.status = 'draft'",
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

    PUBLISHED = "EXISTS (SELECT 1 FROM map_publications x WHERE x.map_id = maps.id AND x.unpublished_at IS NULL)"

    def self.call(scope = Map.all) = new(scope).rows

    def initialize(scope)
      @scope = scope
    end

    def rows
      columns = COUNTS.map { |key, sql| "(#{sql}) AS #{key}_count" }
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
          counts: COUNTS.keys.to_h { |key| [ key.to_s.camelize(:lower), map["#{key}_count"].to_i ] }
        }
      end
  end
end
