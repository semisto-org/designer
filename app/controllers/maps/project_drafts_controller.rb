# Answers an AI proposed for the project sheet (MCP propose_project_sheet):
# a human accepts them (merged into the sheet) or refuses them, one by one or
# all at once (id « all »). Answers with the sheet as it now stands.
module Maps
  class ProjectDraftsController < ApplicationController
    include MapScoped

    before_action :set_map
    before_action :require_editor!
    before_action :set_drafts

    def accept
      sheet = ProjectSheetDraft.accept!(@map, @drafts)
      render json: payload(sheet)
    end

    def reject
      @map.project_sheet_drafts.where(id: @drafts.map(&:id)).delete_all
      render json: payload(@map.project_sheet)
    end

    private
      def set_drafts
        @drafts = params[:id] == "all" ? @map.project_sheet_drafts.to_a : [ @map.project_sheet_drafts.find(params[:id]) ]
      end

      def payload(sheet)
        { project: sheet.to_h, progress: sheet.progress, drafts: @map.project_sheet_drafts.reload.includes(:created_by).map(&:as_json) }
      end
  end
end
