# Human review of the changes an AI proposed to elements already on a map
# (FeatureUpdateDraft, from the MCP tool propose_feature_updates): accept
# (maybe after adjusting the values), reject, or all of one proposal at
# once. Accepted changes stay as the element's history. An accepted
# deletion (propose_deletions) puts the element in the trash: the answer
# names it in deletedId(s) instead of sending it back.
module Maps
  class FeatureUpdatesController < ApplicationController
    include MapScoped

    MAX_BULK = Mcp::UpdateProposal::MAX_PENDING

    before_action :set_map
    before_action :require_editor!, except: :index

    # Pending changes of the map, grouped by proposal (batch); with
    # feature_id, the reviewed changes of that element (its history).
    def index
      if params[:feature_id].present?
        history = @map.feature_update_drafts.reviewed.where(map_feature_id: params[:feature_id])
          .includes(:created_by, :reviewed_by).order(reviewed_at: :desc, id: :desc).limit(50)
        return render json: { history: history.map(&:as_history_json) }
      end
      drafts = @map.feature_update_drafts.pending.includes(:map_feature, :created_by).ordered.to_a
      batches = drafts.group_by(&:batch).map do |batch, items|
        first = items.first
        { batch:, summary: first.summary, clientName: first.client_name, count: items.size, createdAt: first.created_at.iso8601 }
      end
      render json: { updates: drafts.map(&:as_review_json), batches: }
    end

    def accept
      draft = @map.feature_update_drafts.pending.find(params[:id])
      feature = FeatureUpdateDraft.transaction { draft.accept!(Current.user, adjusted_changes) }
      render json: feature.trashed? ? { id: draft.id, deletedId: feature.id } : { id: draft.id, feature: feature.as_geojson }
    rescue ActiveRecord::RecordInvalid => e
      render json: { message: t("feature_updates.errors.invalid", errors: e.record.errors.full_messages.to_sentence) }, status: :unprocessable_entity
    end

    def reject
      draft = @map.feature_update_drafts.pending.find(params[:id])
      draft.reject!(Current.user)
      render json: { id: draft.id }
    end

    # All the pending changes of one proposal (batch) the reviewer saw (ids),
    # so changes that arrived in the meantime are not accepted blindly. One
    # transaction; a change that would make its element invalid is skipped
    # and reported, the others are applied.
    def accept_all
      accepted = []
      failed = []
      FeatureUpdateDraft.transaction do
        MapFeature.no_touching do
          bulk_scope.each do |draft|
            FeatureUpdateDraft.transaction(requires_new: true) do
              accepted << draft.accept!(Current.user)
            end
          rescue ActiveRecord::RecordInvalid => e
            failed << { id: draft.id, featureId: draft.map_feature_id, message: e.record.errors.full_messages.to_sentence }
          end
        end
      end
      # A fresh copy: the savepoint of a skipped change can leave this one stale.
      @map.reload.touch if accepted.any?
      deleted, changed = accepted.partition(&:trashed?)
      render json: { features: changed.map(&:as_geojson), deletedIds: deleted.map(&:id), failed: }
    end

    def reject_all
      drafts = bulk_scope
      FeatureUpdateDraft.where(id: drafts.map(&:id)).update_all(status: "rejected", reviewed_by_id: Current.user.id, reviewed_at: Time.current, updated_at: Time.current)
      render json: { ids: drafts.map(&:id) }
    end

    private
      def bulk_scope
        scope = @map.feature_update_drafts.pending.includes(:map_feature).ordered
        scope = scope.where(batch: params[:batch].to_s) if params[:batch].present?
        scope = scope.where(id: Array(params[:ids]).first(MAX_BULK).map(&:to_i)) if params.key?(:ids)
        scope.limit(MAX_BULK).to_a
      end

      # The person's adjustment of the proposed values, if any.
      def adjusted_changes
        return nil unless params[:changes].present?
        params.require(:changes).permit(:name, :notes, tags: [], properties: {}).to_h
      end
  end
end
