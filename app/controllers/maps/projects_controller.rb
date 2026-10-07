# The project sheet ("fiche projet") of a map: a full page for comfortable
# editing (desktop and phone) and the JSON the editor panel uses. Autosave
# sends one or more fields at a time; the server merges at field level.
module Maps
  class ProjectsController < ApplicationController
    include MapScoped

    before_action :set_map
    before_action :require_editor!, only: :update

    def show
      respond_to do |format|
        format.html { render inertia: "maps/project", props: sheet_props(@map.project_sheet) }
        format.json { render json: sheet_props(@map.project_sheet) }
      end
    end

    def update
      patch = ProjectSheet.parse(params[:project], strict: true)
      unless patch.valid?
        return render json: { errors: patch.errors, message: t("journey.project.invalid") }, status: :unprocessable_entity
      end
      sheet = ProjectSheet.save!(@map, patch)
      render json: { project: sheet.to_h, progress: sheet.progress }
    end

    private
      def sheet_props(sheet)
        {
          map: { id: @map.id, name: @map.name, role: @role, address: @map.address },
          project: sheet.to_h,
          progress: sheet.progress,
          schema: ProjectSheet.schema_json,
          drafts: @map.project_sheet_drafts.includes(:created_by).map(&:as_json),
          canEdit: %w[owner editor].include?(@role),
          formLink: form_link_props
        }
      end

      # The private link for the people behind the project: editors only.
      def form_link_props
        return nil unless %w[owner editor].include?(@role)
        @map.project_sheet_link&.as_json_for_editor(project_form_url(@map.project_sheet_link.token))
      end
  end
end
