# The « Journal IA » of a map, for its owner: every MCP call made on it,
# and for each proposal, what became of its drafts.
module Maps
  class AiActionsController < ApplicationController
    include MapScoped

    PAGE = 50
    # Statuses of proposed changes, in the words of the drafts' outcome.
    UPDATE_OUTCOMES = { "pending" => "draft", "accepted" => "active", "rejected" => "rejected", "withdrawn" => "withdrawn" }.freeze

    before_action :set_map
    before_action :require_owner!

    def index
      scope = AiAction.where(map: @map).includes(:user).newest_first
      scope = scope.where("ai_actions.id < ?", params[:before_id].to_i) if params[:before_id].present?
      actions = scope.limit(PAGE + 1).to_a
      more = actions.size > PAGE
      actions = actions.first(PAGE)
      outcomes = draft_outcomes(actions)
      render json: {
        actions: actions.map { |a| a.as_inertia.merge(outcome: outcomes[a.id]) },
        nextBeforeId: more ? actions.last.id : nil
      }
    end

    private
      # Current status of the drafts each proposal created: new elements,
      # and changes to existing ones (pending reads as « draft », accepted as « active »).
      def draft_outcomes(actions)
        proposals = actions.select { |a| a.tool.in?(%w[propose_features propose_sectors]) && a.result["feature_ids"].present? }
        ids = proposals.flat_map { |a| a.result["feature_ids"] }
        statuses = @map.features.where(id: ids).pluck(:id, :status).to_h
        outcomes = proposals.to_h do |action|
          counts = Hash.new(0)
          action.result["feature_ids"].each { |id| counts[statuses[id] || "withdrawn"] += 1 }
          [ action.id, counts ]
        end
        outcomes.merge(update_outcomes(actions))
      end

      def update_outcomes(actions)
        proposals = actions.select { |a| a.tool.in?(%w[propose_feature_updates propose_deletions]) && a.result["update_ids"].present? }
        statuses = @map.feature_update_drafts.where(id: proposals.flat_map { |a| a.result["update_ids"] }).pluck(:id, :status).to_h
        proposals.to_h do |action|
          counts = Hash.new(0)
          action.result["update_ids"].each { |id| counts[UPDATE_OUTCOMES[statuses[id]] || "withdrawn"] += 1 }
          [ action.id, counts ]
        end
      end
  end
end
