# The project sheet's form alone, opened from its private link
# (/fiche-projet/:token): the people behind the project answer it without an
# account and without seeing the map. Autosave and "I'm done" only.
class ProjectFormsController < ApplicationController
  allow_unauthenticated_access
  before_action { response.set_header("X-Robots-Tag", "noindex, nofollow") }
  before_action :set_link
  rate_limit to: 120, within: 1.minute, only: %i[update submit],
    with: -> { render json: { message: t("journey.form.errors.rate_limited") }, status: :too_many_requests }

  def show
    @link.opened! unless @link.opened_at
    render inertia: "project_forms/show", props: {
      token: @link.token,
      mapName: @map.name,
      invitedBy: @link.created_by&.display_name || @map.owner.display_name,
      project: @map.project_sheet.to_h,
      progress: @map.project_sheet.progress,
      schema: ProjectSheet.schema_json,
      canEdit: !@map.read_only_by_plan?,
      submittedAt: @link.submitted_at&.iso8601
    }
  end

  def update
    return render_read_only if @map.read_only_by_plan?
    patch = ProjectSheet.parse(params[:project], strict: true)
    unless patch.valid?
      return render json: { errors: patch.errors, message: t("journey.project.invalid") }, status: :unprocessable_entity
    end
    sheet = ProjectSheet.save!(@map, patch)
    render json: { project: sheet.to_h, progress: sheet.progress }
  end

  def submit
    return render_read_only if @map.read_only_by_plan?
    @link.submit!
    render json: { submittedAt: @link.submitted_at.iso8601 }
  end

  private
    def set_link
      @link = ProjectSheetLink.includes(:map, :created_by).find_by(token: params[:token])
      return render_gone unless @link&.live?
      @map = @link.map
    end

    def render_gone
      respond_to do |format|
        format.json { render json: { message: t("journey.form.gone.title") }, status: :gone }
        format.any { render inertia: "project_forms/gone", props: {}, status: :gone }
      end
    end

    def render_read_only
      render json: { message: t("journey.form.errors.read_only") }, status: :forbidden
    end
end
