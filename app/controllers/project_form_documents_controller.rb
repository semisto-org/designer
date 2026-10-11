# Documents the people behind the project send with the project sheet,
# from its private link (/fiche-projet/:token): an architect's plan, a
# surveyor's report… They land in the map's « Documents » library. Through
# the link one sees, opens and removes only what was sent through it.
class ProjectFormDocumentsController < ApplicationController
  include ServesMapDocuments

  allow_unauthenticated_access
  before_action { response.set_header("X-Robots-Tag", "noindex, nofollow") }
  before_action :set_link
  before_action :require_writable, only: %i[create destroy]
  before_action :set_document, only: %i[destroy file]
  rate_limit to: 30, within: 1.minute, only: :create,
    with: -> { render json: { message: t("journey.form.errors.rate_limited") }, status: :too_many_requests }

  def index
    render json: { documents: documents_json, limits: document_limits }
  end

  def create
    document = @map.documents.new(document_params.merge(project_sheet_link: @link, origin: "project_sheet"))
    document.save ? render(json: as_json(document), status: :created) : render_document_errors(document)
  end

  def destroy
    @document.destroy!
    head :no_content
  end

  def file
    serve_document(@document)
  end

  private
    def set_link
      @link = ProjectSheetLink.includes(:map).find_by(token: params[:token])
      return render json: { message: t("journey.form.gone.title") }, status: :gone unless @link&.live?
      @map = @link.map
    end

    def require_writable
      render json: { message: t("journey.form.errors.read_only") }, status: :forbidden if @map.read_only_by_plan?
    end

    def set_document
      @document = @link.documents.find(params[:id])
    end

    def documents_json
      @link.documents.newest_first.includes(file_attachment: :blob, thumbnail_attachment: :blob).map { as_json(_1) }
    end

    def as_json(document)
      document.as_inertia(url: ->(doc, size) { project_form_document_file_path(@link.token, doc, size:) })
    end
end
