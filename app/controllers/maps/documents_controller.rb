# The map's « Documents » library: a full page and its JSON. Everyone on the
# map reads and downloads; editors add, rename, tag and remove. Documents
# sent with the project sheet (by the team or through its private link)
# live here too.
module Maps
  class DocumentsController < ApplicationController
    include MapScoped
    include ServesMapDocuments

    before_action :set_map
    before_action :require_editor!, except: %i[index file]
    before_action :set_document, only: %i[update destroy file]

    def index
      respond_to do |format|
        format.html do
          render inertia: "maps/documents/index", props: {
            map: @map.as_inertia(Current.user).slice(:id, :name, :areaM2, :role),
            documents: documents_json,
            canEdit: editor?,
            limits: document_limits
          }
        end
        format.json { render json: { documents: documents_json, limits: document_limits } }
      end
    end

    def create
      document = @map.documents.new(document_params.merge(uploaded_by: Current.user, origin: origin_param))
      document.save ? render(json: as_json(document), status: :created) : render_document_errors(document)
    end

    def update
      @document.update(document_params(%i[title description])) ? render(json: as_json(@document)) : render_document_errors(@document)
    end

    def destroy
      @document.destroy!
      head :no_content
    end

    # /maps/:map_id/documents/:id/file?size=thumb|large|original|download
    def file
      serve_document(@document)
    end

    private
      def editor? = %w[owner editor].include?(@role)

      def set_document
        @document = @map.documents.find(params[:id])
      end

      def origin_param
        params.dig(:document, :origin).presence_in(MapDocument::ORIGINS) || "library"
      end

      def documents_json
        @map.documents.newest_first.includes(:uploaded_by, file_attachment: :blob, thumbnail_attachment: :blob).map { as_json(_1) }
      end

      def as_json(document)
        document.as_inertia(url: ->(doc, size) { file_map_document_path(@map, doc, size:) })
      end
  end
end
