# The internal note at the bottom of a section of the project sheet, for the
# map's team or its pro owner only (ProjectSheetNote). Autosaved from the
# sheet's page and panel. Anyone else on the map gets a 404: the notes are
# not even announced to them.
module Maps
  class ProjectNotesController < ApplicationController
    include MapScoped

    before_action :set_map
    before_action :require_audience!

    def update
      return head :forbidden unless ProjectSheetNote.writable?(@map, Current.user)
      return head :not_found unless ProjectSheet::SECTIONS.key?(params[:section])

      note = ProjectSheetNote.write!(@map, params[:section], params[:body], user: Current.user, lock_version: params[:lock_version])
      render json: { section: params[:section], note: note&.as_json }
    rescue ActiveRecord::StaleObjectError, ActiveRecord::RecordNotUnique
      current = @map.project_sheet_notes.includes(:updated_by).find_by(section: params[:section])
      render json: { message: t("journey.project.team_notes.conflict"), note: current&.as_json }, status: :conflict
    rescue ActiveRecord::RecordInvalid => e
      render json: { message: e.record.errors.full_messages.to_sentence }, status: :unprocessable_entity
    end

    private
      def require_audience!
        head :not_found unless ProjectSheetNote.audience?(@map, Current.user)
      end
  end
end
