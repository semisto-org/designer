# Real-time co-editing: every committed change to a feature is pushed to the
# editors and viewers connected to its map (MapFeaturesChannel), whatever
# made it (editor, AI drafts, MCP). Clients apply what is newer than their
# copy, so their own echoes are ignored.
module MapFeature::Broadcasts
  extend ActiveSupport::Concern

  included do
    after_create_commit { broadcast_feature_change }
    after_update_commit { broadcast_feature_change }
    after_destroy_commit { broadcast_feature_change(removed: true) }
  end

  private
    def broadcast_feature_change(removed: false)
      removed ||= status == "rejected"
      MapFeaturesChannel.broadcast_to(map, {
        action: removed ? "remove" : "upsert",
        id:,
        actorId: updated_by_id || created_by_id,
        feature: removed ? nil : as_geojson
      })
    end
end
