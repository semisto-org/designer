# The « Journal IA » of a map, for its owner: every MCP call made on it,
# and for each proposal, what became of its drafts.
module Maps
  class AiActionsController < ApplicationController
    include MapScoped

    PAGE = 50

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
      # Current status of the drafts each proposal created.
      def draft_outcomes(actions)
        proposals = actions.select { |a| a.tool == "propose_features" && a.result["feature_ids"].present? }
        ids = proposals.flat_map { |a| a.result["feature_ids"] }
        statuses = @map.features.where(id: ids).pluck(:id, :status).to_h
        proposals.to_h do |action|
          counts = Hash.new(0)
          action.result["feature_ids"].each { |id| counts[statuses[id] || "withdrawn"] += 1 }
          [ action.id, counts ]
        end
      end
  end
end
