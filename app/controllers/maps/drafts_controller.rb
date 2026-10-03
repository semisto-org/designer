# Human review of the drafts an AI proposed on a map: accept (the element
# becomes active, still marked as coming from an AI) or reject (kept for
# the journal, hidden from the map), one by one or all at once.
module Maps
  class DraftsController < ApplicationController
    include MapScoped

    MAX_BULK = 1000

    before_action :set_map
    before_action :require_editor!, except: :index

    def index
      latest = AiAction.where(map: @map, tool: "propose_features", status: "ok").newest_first.first
      render json: {
        drafts: @map.features.drafts.order(:id).map(&:as_geojson),
        author: latest&.client_name,
        summary: latest&.arguments&.dig("summary")
      }
    end

    def accept
      feature = @map.features.drafts.find(params[:id])
      feature.update!(status: "active", updated_by: Current.user)
      render json: feature.as_geojson
    end

    def reject
      feature = @map.features.drafts.find(params[:id])
      feature.update!(status: "rejected", updated_by: Current.user)
      render json: { id: feature.id }
    end

    def accept_all
      features = review_all("active")
      render json: { features: features.map(&:as_geojson) }
    end

    def reject_all
      features = review_all("rejected")
      render json: { ids: features.map(&:id) }
    end

    private
      # Only the drafts the reviewer saw (ids), so drafts that arrived in
      # the meantime are not accepted blindly.
      def review_all(status)
        scope = @map.features.drafts.order(:id)
        scope = scope.where(id: Array(params[:ids]).first(MAX_BULK).map(&:to_i)) if params.key?(:ids)
        features = scope.limit(MAX_BULK).to_a
        MapFeature.transaction do
          MapFeature.no_touching { features.each { |f| f.update!(status:, updated_by: Current.user) } }
        end
        @map.touch if features.any?
        features
      end
  end
end
